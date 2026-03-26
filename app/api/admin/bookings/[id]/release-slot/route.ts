import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { BOOKING_STATUSES_SLOT_TAKEN, type Booking } from "@/lib/booking/types";
import { resetBookingSlotsToOpenInTransaction } from "@/lib/booking/slot-reset";

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
    const bookingRef = db.collection("bookings").doc(bookingId);
    let updated = 0;
    let slotId: string | null = null;
    let alreadyCanceled = false;
    let notReleasable = false;
    await db.runTransaction(async (tx) => {
      const bookingSnap = await tx.get(bookingRef);
      if (!bookingSnap.exists) throw new Error("BOOKING_NOT_FOUND");
      const booking = bookingSnap.data() as Booking;
      slotId = typeof booking.slotId === "string" ? booking.slotId : null;
      if (!slotId) throw new Error("BOOKING_MISSING_SLOT");
      if (booking.status === "canceled") {
        alreadyCanceled = true;
        return;
      }
      if (!BOOKING_STATUSES_SLOT_TAKEN.has(booking.status)) {
        notReleasable = true;
        return;
      }
      let expSlug = "";
      if (typeof booking.experienceId === "string" && booking.experienceId.trim()) {
        const expSnap = await tx.get(db.collection("experiences").doc(booking.experienceId));
        expSlug =
          expSnap.exists && typeof (expSnap.data() as { slug?: unknown })?.slug === "string"
            ? String((expSnap.data() as { slug: string }).slug).trim()
            : "";
      }
      updated = await resetBookingSlotsToOpenInTransaction(db, tx, bookingId, booking, expSlug);
      if (updated > 0) {
        tx.update(bookingRef, { status: "canceled", updatedAt: FieldValue.serverTimestamp() });
      }
    });
    if (alreadyCanceled) return NextResponse.json({ ok: true, bookingId, already: true, slotReleased: false });
    if (notReleasable) {
      return NextResponse.json({ error: "Booking status does not require slot release" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, bookingId, slotId, updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "BOOKING_NOT_FOUND") return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (message === "BOOKING_MISSING_SLOT") {
      return NextResponse.json({ error: "Booking is missing slot metadata" }, { status: 400 });
    }
    await writeOperationalAlert({
      type: "admin_release_slot_failed",
      source: "admin-release-slot",
      bookingId,
      error: message.slice(0, 500),
    }).catch(() => {});
    return NextResponse.json({ error: "Failed to release slot" }, { status: 500 });
  }
}
