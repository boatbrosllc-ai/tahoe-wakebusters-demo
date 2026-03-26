import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import type { Booking } from "@/lib/booking/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  const { id: bookingId } = await params;
  if (!bookingId) return NextResponse.json({ error: "Missing booking id" }, { status: 400 });

  try {
    const db = getDb();
    const { FieldValue } = getFirestoreExports();
    const bookingSnap = await db.collection("bookings").doc(bookingId).get();
    if (!bookingSnap.exists) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    const booking = bookingSnap.data() as Booking;
    const slotId = booking.slotId;
    const experienceId = booking.experienceId;
    const boatId = booking.boatId;
    if (!slotId || !experienceId) {
      return NextResponse.json({ error: "Booking is missing slot or experience id" }, { status: 400 });
    }

    const expSnap = await db.collection("experiences").doc(experienceId).get();
    const expSlug =
      expSnap.exists && typeof (expSnap.data() as { slug?: unknown })?.slug === "string"
        ? String((expSnap.data() as { slug: string }).slug).trim()
        : "";
    const variants = getExperienceIdVariants(experienceId, expSlug);
    const boatSnaps = await Promise.all(
      variants.map((v) =>
        db
          .collection("boats")
          .where("isListingBoat", "==", true)
          .where("active", "==", true)
          .where("experienceIds", "array-contains", v)
          .get()
      )
    );
    const relatedBoatIds = Array.from(new Set(boatSnaps.flatMap((s) => s.docs.map((d) => d.id))));
    const candidateRefs = [
      db.collection("experiences").doc(experienceId).collection("slots").doc(slotId),
      ...relatedBoatIds.map((bid) => db.collection("boats").doc(bid).collection("slots").doc(slotId)),
      ...(boatId ? [db.collection("boats").doc(boatId).collection("slots").doc(slotId)] : []),
    ];
    const snaps = await db.getAll(...candidateRefs);
    const batch = db.batch();
    let updated = 0;
    for (const s of snaps) {
      if (!s.exists) continue;
      const status = (s.data() as { status?: string }).status;
      if (status !== "booked" && status !== "held") continue;
      batch.update(s.ref, {
        status: "open",
        holdId: FieldValue.delete(),
        bookingId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      updated++;
    }
    if (updated > 0) await batch.commit();
    return NextResponse.json({ ok: true, bookingId, slotId, updated });
  } catch (err) {
    await writeOperationalAlert({
      type: "admin_release_slot_failed",
      source: "admin-release-slot",
      bookingId,
      error: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
    }).catch(() => {});
    return NextResponse.json({ error: "Failed to release slot" }, { status: 500 });
  }
}
