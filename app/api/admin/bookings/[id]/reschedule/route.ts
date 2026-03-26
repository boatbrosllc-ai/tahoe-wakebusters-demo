import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { parseSlotId, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { assertSlotAvailable, SlotConflictError } from "@/lib/booking/slot-availability";
import { BOOKING_STATUSES_SLOT_TAKEN, type Booking } from "@/lib/booking/types";
import { resetBookingSlotsToOpenInTransaction } from "@/lib/booking/slot-reset";
import { addConfirmationOutboxInTransaction } from "@/lib/booking/notification-outbox";
import { resolveHoldBookingPricing } from "@/lib/booking/hold-charge-resolver";
import { computeFinalChargeAtUtc } from "@/lib/booking/final-charge-at";
import { createWaiverForBooking, sendWaiverInviteAndMarkSent } from "@/lib/waiver/on-booking-created";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";

type RescheduleBody = {
  slotId?: string;
  rateId?: string;
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
  const requestedRateId = typeof body.rateId === "string" && body.rateId.trim() ? body.rateId.trim() : undefined;

  const db = getDb();
  const { Timestamp, FieldValue } = getFirestoreExports();
  const bookingRef = db.collection("bookings").doc(bookingId);

  try {
    const preBookingSnap = await bookingRef.get();
    if (!preBookingSnap.exists) throw new Error("BOOKING_NOT_FOUND");
    const preBooking = preBookingSnap.data() as Booking;
    if (!BOOKING_STATUSES_SLOT_TAKEN.has(preBooking.status as never)) {
      throw new Error("BOOKING_NOT_RESCHEDULABLE");
    }
    const preExperienceId = typeof preBooking.experienceId === "string" ? preBooking.experienceId.trim() : "";
    if (!preExperienceId) throw new Error("BOOKING_MISSING_EXPERIENCE");
    const expSnapForPricing = await db.collection("experiences").doc(preExperienceId).get();
    if (!expSnapForPricing.exists) throw new Error("BOOKING_MISSING_EXPERIENCE");
    const expForPricing = expSnapForPricing.data() as { pricingType?: string; maxCapacity?: number };
    const expPricingType = expForPricing.pricingType;
    const resolvedRateId = requestedRateId ?? preBooking.rateId;

    const pricingResolved = await resolveHoldBookingPricing(db, {
      // Minimal Hold-like object for pricing resolution.
      // We omit `pricing` to force live recomputation for the new slot date.
      slotId: newSlotId,
      boatId: preBooking.boatId,
      experienceId: preExperienceId,
      bookingMode: preBooking.bookingMode,
      pricingType: expPricingType,
      rateId: resolvedRateId,
      addonSelections: preBooking.addonSelections,
      partySize: preBooking.partySize,
    } as unknown as Parameters<typeof resolveHoldBookingPricing>[1], { mode: "checkout" });

    const computedPricing = pricingResolved.pricing;

    let clearedWaiverPointer = false;
    let hadExistingWaiverRequestId: string | null = null;
    const customerEmail = preBooking.customer?.email?.trim() ?? "";
    const customerName = preBooking.customer?.name ?? "";
    const depositCents =
      typeof preBooking.stripe?.depositAmountCents === "number" ? preBooking.stripe.depositAmountCents : null;
    const isDepositBooking =
      depositCents != null &&
      depositCents > 0 &&
      ["deposit_paid", "final_due", "final_processing", "final_failed", "final_requires_action", "final_paid"].includes(
        String(preBooking.status)
      );

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
      if (!expSnap.exists) throw new Error("BOOKING_MISSING_EXPERIENCE");

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
        // Ignore the old slot doc during same-day conflict checking (reschedule may be extending).
        ignoreSlotDocIds: [oldSlotId],
        // Exclude the booking being rescheduled so it doesn't block itself.
        excludeBookingId: bookingId,
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
      for (const ref of Array.from(newSlotRefs.values())) {
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

        // Comment 15: do not persist client-supplied pricing; always recompute.
        pricing: computedPricing,
      };
      if (requestedRateId) updatePayload.rateId = requestedRateId;

      // Void old waiver doc; keep booking.waiver until new waiver is created post-transaction (Comment 6).
      const existingWaiverRequestId =
        typeof booking.waiver?.requestId === "string" && booking.waiver.requestId.trim() ? booking.waiver.requestId.trim() : null;
      if (existingWaiverRequestId) {
        clearedWaiverPointer = true;
        hadExistingWaiverRequestId = existingWaiverRequestId;
        tx.update(db.collection("waiverRequests").doc(existingWaiverRequestId), {
          status: "void",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      if (isDepositBooking) {
        const newFinalCents = Math.max(0, computedPricing.totalCents - (depositCents ?? 0));
        const finalChargeAtDate = computeFinalChargeAtUtc(slotStart);
        updatePayload.finalChargeAt = Timestamp.fromDate(finalChargeAtDate);
        updatePayload["stripe.finalAmountCents"] = newFinalCents;
        updatePayload["stripe.totalAmountCents"] = computedPricing.totalCents;
      }

      tx.update(bookingRef, updatePayload);

      // Comment 1: create durable reschedule confirmation outbox entry atomically.
      await addConfirmationOutboxInTransaction(tx, db, bookingId, {
        rescheduled: true,
        waiverPointerCleared: clearedWaiverPointer,
      });
    });

    if (hadExistingWaiverRequestId && customerEmail) {
      try {
        const waiverResult = await createWaiverForBooking({
          bookingId,
          customerEmail,
          customerName,
        });
        if (waiverResult?.sendSeparateWaiverInvite) {
          await sendWaiverInviteAndMarkSent(waiverResult);
        }
      } catch (waiverErr) {
        const msg = waiverErr instanceof Error ? waiverErr.message : String(waiverErr);
        console.error("[admin/reschedule] createWaiverForBooking failed", bookingId, waiverErr);
        await writeOperationalAlert({
          type: "admin_reschedule_waiver_creation_failed",
          bookingId,
          source: "admin-reschedule",
          error: msg.slice(0, 500),
        });
        await db.collection("pendingWaiverCreation").doc(bookingId).set(
          {
            bookingId,
            customerEmail,
            customerName,
            previousVoidedRequestId: hadExistingWaiverRequestId,
            error: msg.slice(0, 1000),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }

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
