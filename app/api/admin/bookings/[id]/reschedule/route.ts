import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { parseSlotId, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { assertSlotAvailable, SlotConflictError } from "@/lib/booking/slot-availability";
import { BOOKING_STATUSES_SLOT_TAKEN, type Booking } from "@/lib/booking/types";
import { resetBookingSlotsToOpenInTransaction } from "@/lib/booking/slot-reset";

type RescheduleBody = {
  slotId?: string;
  rateId?: string;
  pricing?: Booking["pricing"];
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id: bookingId } = await params;
  if (!bookingId) return NextResponse.json({ error: "Missing booking id" }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as RescheduleBody;
  const newSlotId = typeof body.slotId === "string" ? body.slotId.trim() : "";
  if (!newSlotId) return NextResponse.json({ error: "slotId is required" }, { status: 400 });
  const parsedNew = parseSlotId(newSlotId);
  if (!parsedNew) return NextResponse.json({ error: "Invalid slotId" }, { status: 400 });

  const db = getDb();
  const { Timestamp, FieldValue } = getFirestoreExports();
  const bookingRef = db.collection("bookings").doc(bookingId);

  try {
    await db.runTransaction(async (tx) => {
      const bookingSnap = await tx.get(bookingRef);
      if (!bookingSnap.exists) throw new Error("BOOKING_NOT_FOUND");
      const booking = bookingSnap.data() as Booking;
      if (!BOOKING_STATUSES_SLOT_TAKEN.has(booking.status as never)) {
        throw new Error("BOOKING_NOT_RESCHEDULABLE");
      }

      const experienceId = typeof booking.experienceId === "string" ? booking.experienceId.trim() : "";
      if (!experienceId) throw new Error("BOOKING_MISSING_EXPERIENCE");
      const boatId = typeof booking.boatId === "string" ? booking.boatId.trim() : "";
      const oldSlotId = typeof booking.slotId === "string" ? booking.slotId.trim() : "";
      if (!oldSlotId) throw new Error("BOOKING_MISSING_SLOT");
      if (oldSlotId === newSlotId) return;

      const expSnap = await tx.get(db.collection("experiences").doc(experienceId));
      const expSlug =
        expSnap.exists && typeof (expSnap.data() as { slug?: string })?.slug === "string"
          ? (expSnap.data() as { slug: string }).slug.trim()
          : "";
      const variants = getExperienceIdVariants(experienceId, expSlug);
      const { start: slotStart, end: slotEnd } = getSlotStartEnd(
        parsedNew.dateStr,
        parsedNew.startHour,
        parsedNew.durationHours,
        parsedNew.startMinute ?? 0
      );

      await assertSlotAvailable({
        db,
        Timestamp,
        get: (refOrQuery) => tx.get(refOrQuery as never),
        experienceId,
        experienceIdVariants: variants,
        parsed: parsedNew,
        slotStart,
        slotEnd,
        boatId: boatId || undefined,
        useBoatSlots: !!boatId,
        runSameDaySlotScan: true,
      });

      await resetBookingSlotsToOpenInTransaction(db, tx, bookingId, booking, expSlug);
      const newSlotRefs = new Map<string, FirebaseFirestore.DocumentReference>();
      if (boatId) {
        newSlotRefs.set(
          `boats/${boatId}/slots/${newSlotId}`,
          db.collection("boats").doc(boatId).collection("slots").doc(newSlotId)
        );
      }
      newSlotRefs.set(
        `experiences/${experienceId}/slots/${newSlotId}`,
        db.collection("experiences").doc(experienceId).collection("slots").doc(newSlotId)
      );
      for (const v of variants) {
        newSlotRefs.set(
          `experiences/${v}/slots/${newSlotId}`,
          db.collection("experiences").doc(v).collection("slots").doc(newSlotId)
        );
      }
      for (const ref of newSlotRefs.values()) {
        tx.set(
          ref,
          {
            status: "booked",
            bookingId,
            holdId: FieldValue.delete(),
            startAt: Timestamp.fromDate(slotStart),
            endAt: Timestamp.fromDate(slotEnd),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      const updatePayload: Record<string, unknown> = {
        slotId: newSlotId,
        startDateStr: parsedNew.dateStr,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (typeof body.rateId === "string" && body.rateId.trim()) updatePayload.rateId = body.rateId.trim();
      if (body.pricing && typeof body.pricing === "object") updatePayload.pricing = body.pricing;
      tx.update(bookingRef, updatePayload);
    });

    return NextResponse.json({ ok: true, bookingId, slotId: newSlotId });
  } catch (err) {
    if (err instanceof SlotConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : String(err);
    if (message === "BOOKING_NOT_FOUND") return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (message === "BOOKING_NOT_RESCHEDULABLE") {
      return NextResponse.json({ error: "Booking is not in a reschedulable status" }, { status: 409 });
    }
    if (message === "BOOKING_MISSING_EXPERIENCE" || message === "BOOKING_MISSING_SLOT") {
      return NextResponse.json({ error: "Booking is missing required slot metadata" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to reschedule booking" }, { status: 500 });
  }
}
