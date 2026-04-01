import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { isAllowedSlotTime, isListingBoatCharterStartTimeAllowed, parseSlotId, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { assertSlotAvailable, SlotConflictError } from "@/lib/booking/slot-availability";
import { BOOKING_STATUSES_SLOT_TAKEN, type Booking } from "@/lib/booking/types";
import { resetBookingSlotsToOpenInTransaction } from "@/lib/booking/slot-reset";
import { addConfirmationOutboxInTransaction } from "@/lib/booking/notification-outbox";
import { deleteTripScheduleNotificationClaimsInTransaction } from "@/lib/booking/notification-claim";
import { deleteTripScheduleReminderRetryQueueInTransaction } from "@/lib/booking/reminder-retry";
import { resolveHoldBookingPricing } from "@/lib/booking/hold-charge-resolver";
import { computeFinalChargeAtUtc } from "@/lib/booking/final-charge-at";
import { createWaiverForBooking, sendWaiverInviteAndMarkSent } from "@/lib/waiver/on-booking-created";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { getStripe } from "@/lib/booking/stripe-client";
import { pendingRefundDocumentId } from "@/lib/booking/pending-refund-idempotent";
import { writeAdminAuditLog } from "@/lib/booking/admin-audit-log";
import { getAdminEmailFromSessionCookie } from "@/lib/admin-auth-firebase";
import { applyExperienceRevenueDelta, totalSummaryAttributedRevenueCents } from "@/lib/booking/summary-revenue";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
import {
  getDepartureInventoryRef,
  releaseCapacityWithPreRead,
  reserveCapacity,
} from "@/lib/booking/shared-departure-inventory";

type RescheduleBody = {
  slotId?: string;
  rateId?: string;
  confirmPricingChange?: boolean;
  skipPricingRecompute?: boolean;
  force?: boolean;
};

const RESCHEDULABLE_STATUSES = new Set(["paid", "final_due", "final_paid", "final_processing"]);

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
  const confirmPricingChange = body.confirmPricingChange === true;
  const skipPricingRecompute = body.skipPricingRecompute === true;

  const db = getDb();
  const { Timestamp, FieldValue } = getFirestoreExports();
  const bookingRef = db.collection("bookings").doc(bookingId);

  let computedPricing = { totalCents: 0, currency: "usd" } as Booking["pricing"];
  let stripeStoredTotalCents: number | null = null;

  try {
    const preBookingSnap = await bookingRef.get();
    if (!preBookingSnap.exists) throw new Error("BOOKING_NOT_FOUND");
    const preBooking = preBookingSnap.data() as Booking;
    const force = body.force === true;
    if ((!force && !RESCHEDULABLE_STATUSES.has(preBooking.status)) || (force && !BOOKING_STATUSES_SLOT_TAKEN.has(preBooking.status as never))) {
      throw new Error("BOOKING_NOT_RESCHEDULABLE");
    }
    const preExperienceId = typeof preBooking.experienceId === "string" ? preBooking.experienceId.trim() : "";
    if (!preExperienceId) throw new Error("BOOKING_MISSING_EXPERIENCE");

    let clearedWaiverPointer = false;
    let hadExistingWaiverRequestId: string | null = null;
    const customerEmail = preBooking.customer?.email?.trim() ?? "";
    const customerName = preBooking.customer?.name ?? "";
    const depositCents =
      typeof preBooking.stripe?.depositAmountCents === "number" ? preBooking.stripe.depositAmountCents : null;
    const isDepositBooking =
      depositCents != null &&
      depositCents > 0 &&
      ["final_due", "final_processing", "final_failed", "final_requires_action", "final_paid"].includes(
        String(preBooking.status)
      );
    stripeStoredTotalCents =
      typeof preBooking.stripe?.totalAmountCents === "number" ? preBooking.stripe.totalAmountCents : null;

    const confirmationDispatchId = randomUUID();

    const oldParsed = parseSlotId(typeof preBooking.slotId === "string" ? preBooking.slotId : "");
    if (!oldParsed) throw new Error("BOOKING_MISSING_SLOT");
    if (!requestedRateId && parsedNew.durationHours !== oldParsed.durationHours) {
      throw new Error("DURATION_MISMATCH");
    }

    if (preBooking.boatId) {
      const boatSnap = await db.collection("boats").doc(preBooking.boatId).get();
      if (!boatSnap.exists) return NextResponse.json({ error: "Boat not found" }, { status: 400 });
      const boat = boatSnap.data() as {
        allowedStartTimes?: { hour: number; minute: number }[];
        boatType?: string;
      };
      const isAllowed = isListingBoatCharterStartTimeAllowed(
        boat,
        parsedNew.dateStr,
        parsedNew.startHour,
        parsedNew.startMinute ?? 0,
        parsedNew.durationHours,
        true
      );
      if (!isAllowed) {
        return NextResponse.json({ error: "Requested time is outside allowed operating hours" }, { status: 400 });
      }
    } else {
      const isAllowed = isAllowedSlotTime(parsedNew.startHour, parsedNew.startMinute ?? 0, parsedNew.durationHours);
      if (!isAllowed) {
        return NextResponse.json({ error: "Requested time is outside allowed operating hours" }, { status: 400 });
      }
    }

    computedPricing = preBooking.pricing ?? { totalCents: 0, currency: "usd" };
    const currentTotalCents = typeof preBooking.pricing?.totalCents === "number" ? preBooking.pricing.totalCents : 0;
    let priceDeltaCents = 0;
    let summaryAdjustedCents = 0;
    let refundPending = false;
    let refundAmountCents = 0;
    let finalPiToCancel: string | null = null;

    await db.runTransaction(async (tx) => {
      const bookingSnap = await tx.get(bookingRef);
      if (!bookingSnap.exists) throw new Error("BOOKING_NOT_FOUND");
      const booking = bookingSnap.data() as Booking;
      if ((!force && !RESCHEDULABLE_STATUSES.has(booking.status)) || (force && !BOOKING_STATUSES_SLOT_TAKEN.has(booking.status as never))) {
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
      const exp = expSnap.data() as { slug?: string; pricingType?: string; maxCapacity?: number };
      const resolvedRateId = requestedRateId ?? booking.rateId;
      const rateInTx = await tx.get(db.collection("experiences").doc(experienceId).collection("rates").doc(resolvedRateId));
      if (!rateInTx.exists) throw new Error("RATE_NOT_FOUND");
      const rateDuration = (rateInTx.data() as { durationHours?: number }).durationHours;
      if (requestedRateId) {
        if (typeof rateDuration === "number" && parsedNew.durationHours !== rateDuration) {
          throw new Error("DURATION_MISMATCH");
        }
      } else {
        const oldParsedTx = parseSlotId(oldSlotId);
        const expectedDuration = typeof rateDuration === "number" ? rateDuration : oldParsedTx?.durationHours;
        if (!expectedDuration || expectedDuration !== parsedNew.durationHours) {
          throw new Error("DURATION_MISMATCH");
        }
      }

      computedPricing = skipPricingRecompute
        ? (booking.pricing ?? { totalCents: 0, currency: "usd" })
        : (await resolveHoldBookingPricing(db, {
            slotId: newSlotId,
            boatId: booking.boatId,
            experienceId,
            bookingMode: booking.bookingMode,
            pricingType: exp.pricingType,
            rateId: resolvedRateId,
            addonSelections: booking.addonSelections,
            partySize: booking.partySize,
          } as unknown as Parameters<typeof resolveHoldBookingPricing>[1], { mode: "checkout" })).pricing;
      const currentTotal = typeof booking.pricing?.totalCents === "number" ? booking.pricing.totalCents : 0;
      priceDeltaCents = computedPricing.totalCents - currentTotal;
      const isFullyPaidBooking = booking.status === "paid";
      const depositCentsTx =
        typeof booking.stripe?.depositAmountCents === "number" ? booking.stripe.depositAmountCents : null;
      const isDepositBookingTx =
        depositCentsTx != null &&
        depositCentsTx > 0 &&
        ["final_due", "final_processing", "final_failed", "final_requires_action", "final_paid"].includes(String(booking.status));
      const stripeStoredTotalCentsTx =
        typeof booking.stripe?.totalAmountCents === "number" ? booking.stripe.totalAmountCents : null;
      const isFinalizedDepositBookingTx = isDepositBookingTx && booking.status === "final_paid";
      if (
        isDepositBookingTx &&
        !skipPricingRecompute &&
        stripeStoredTotalCentsTx != null &&
        computedPricing.totalCents !== stripeStoredTotalCentsTx &&
        !confirmPricingChange
      ) {
        throw new Error("PRICING_CHANGE_REQUIRES_CONFIRMATION");
      }
      if (
        isFinalizedDepositBookingTx &&
        stripeStoredTotalCentsTx != null &&
        computedPricing.totalCents !== stripeStoredTotalCentsTx
      ) {
        throw new Error("FINALIZED_DEPOSIT_SETTLEMENT_REQUIRED");
      }
      if (isFullyPaidBooking && priceDeltaCents > 0) {
        throw new Error("FULLY_PAID_INCREASE_NOT_ALLOWED");
      }

      const expSlug =
        expSnap.exists && typeof exp.slug === "string"
          ? exp.slug.trim()
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

      let soldOnNewDate = 0;
      if (booking.bookingMode === "shared" && exp.pricingType === "ticketed") {
        const soldSnaps = await Promise.all(
          variants.map((v) =>
            tx.get(
              db.collection("bookings").where("experienceId", "==", v).where("startDateStr", "==", parsedNew.dateStr)
            )
          )
        );
        const seen = new Set<string>();
        for (const soldSnap of soldSnaps) {
          for (const doc of soldSnap.docs) {
            if (seen.has(doc.id) || doc.id === bookingId) continue;
            seen.add(doc.id);
            const b = doc.data() as Booking;
            if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
            if (b.bookingMode !== "shared") continue;
            soldOnNewDate += typeof b.partySize === "number" ? b.partySize : 0;
          }
        }
      }

      const departureInvOld = {
        current: null as { ref: FirebaseFirestore.DocumentReference; reserved: number } | null,
      };
      const departureInvNew = {
        current: null as { ref: FirebaseFirestore.DocumentReference; reserved: number } | null,
      };

      /** Read departure inventory before slot reads/writes — not between slot reads and slot writes. */
      if (booking.bookingMode === "shared" && exp.pricingType === "ticketed") {
        const oldDateStrInv = typeof booking.startDateStr === "string" ? booking.startDateStr.trim() : "";
        if (oldDateStrInv) {
          const oldRef = getDepartureInventoryRef(db, experienceId, oldDateStrInv);
          const oldSnap = await tx.get(oldRef);
          departureInvOld.current = {
            ref: oldRef,
            reserved: oldSnap.exists
              ? ((oldSnap.data() as { reservedSeats?: number }).reservedSeats ?? 0)
              : 0,
          };
        }
        const newRef = getDepartureInventoryRef(db, experienceId, parsedNew.dateStr);
        const newSnap = await tx.get(newRef);
        departureInvNew.current = {
          ref: newRef,
          reserved: newSnap.exists
            ? ((newSnap.data() as { reservedSeats?: number }).reservedSeats ?? 0)
            : 0,
        };
      }

      await resetBookingSlotsToOpenInTransaction(db, tx, bookingId, booking, expSlug);

      if (booking.bookingMode === "shared" && exp.pricingType === "ticketed") {
        const oldDateStr = typeof booking.startDateStr === "string" ? booking.startDateStr.trim() : "";
        if (oldDateStr && departureInvOld.current) {
          const o = departureInvOld.current;
          releaseCapacityWithPreRead(tx, o.ref, booking.partySize, o.reserved);
        }
        const capacity = exp.maxCapacity ?? getMaxGuestsForExperience(exp as never);
        if (departureInvNew.current) {
          const n = departureInvNew.current;
          await reserveCapacity(
            tx,
            n.ref,
            capacity,
            booking.partySize,
            soldOnNewDate,
            { preReadReservedSeats: n.reserved }
          );
        }
      }

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

        reminder1WeekSentAt: FieldValue.delete(),
        reminder24hSentAt: FieldValue.delete(),
        reminderDayOfSentAt: FieldValue.delete(),
        finalReminderSentAt: FieldValue.delete(),
        finalPaymentRequestSentAt: FieldValue.delete(),
        reminder1WeekSmsSentAt: FieldValue.delete(),
        reminder24hSmsSentAt: FieldValue.delete(),
        reminderDayOfSmsSentAt: FieldValue.delete(),
        finalReminderSmsSentAt: FieldValue.delete(),
        finalPaymentRequestSmsSentAt: FieldValue.delete(),
      };
      if (requestedRateId) updatePayload.rateId = requestedRateId;

      deleteTripScheduleNotificationClaimsInTransaction(tx, db, bookingId);
      deleteTripScheduleReminderRetryQueueInTransaction(tx, db, bookingId);

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

      if (isDepositBookingTx && !isFinalizedDepositBookingTx) {
        const newFinalCents = Math.max(0, computedPricing.totalCents - (depositCentsTx ?? 0));
        const finalChargeAtDate = computeFinalChargeAtUtc(slotStart);
        updatePayload.finalChargeAt = Timestamp.fromDate(finalChargeAtDate);
        updatePayload["stripe.finalAmountCents"] = newFinalCents;
        updatePayload["stripe.totalAmountCents"] = computedPricing.totalCents;
        if (
          typeof booking.stripe?.finalAmountCents === "number" &&
          booking.stripe.finalAmountCents !== newFinalCents &&
          booking.stripe.finalPaymentIntentId
        ) {
          finalPiToCancel = booking.stripe.finalPaymentIntentId;
        }
        updatePayload["stripe.finalPaymentIntentId"] = FieldValue.delete();
      }

      if (isFullyPaidBooking && priceDeltaCents < 0) {
        const revenueCents = totalSummaryAttributedRevenueCents(booking);
        summaryAdjustedCents = priceDeltaCents;
        if (revenueCents > 0) {
          tx.set(
            db.collection("summaries").doc("revenue"),
            { totalRevenueCents: FieldValue.increment(priceDeltaCents) },
            { merge: true }
          );
          const createdDate = (booking.createdAt as { toDate?: () => Date })?.toDate?.();
          const monthKey = typeof booking.summaryMonthKey === "string" && booking.summaryMonthKey.trim()
            ? booking.summaryMonthKey.trim()
            : createdDate
              ? `revenue_${createdDate.getFullYear()}_${String(createdDate.getMonth() + 1).padStart(2, "0")}`
              : null;
          if (monthKey) {
            tx.set(
              db.collection("summaries").doc(monthKey),
              { revenueCents: FieldValue.increment(priceDeltaCents) },
              { merge: true }
            );
          }
          applyExperienceRevenueDelta(tx, db, FieldValue, experienceId, priceDeltaCents, 0);
        }
      }
      // Deposit bookings are not summary-adjusted here for final amount deltas; the
      // follow-up `final_paid` transition applies the authoritative final increment.
      // Reconcile cron validates aggregate consistency for this delayed adjustment path.

      tx.update(bookingRef, updatePayload);

      // Comment 1: create durable reschedule confirmation outbox entry atomically.
      await addConfirmationOutboxInTransaction(tx, db, bookingId, {
        rescheduled: true,
        waiverPointerCleared: clearedWaiverPointer,
        confirmationDispatchId,
        ...(isDepositBookingTx &&
        stripeStoredTotalCentsTx != null &&
        computedPricing.totalCents !== stripeStoredTotalCentsTx &&
        confirmPricingChange
          ? {
              oldTotalCents: stripeStoredTotalCentsTx,
              newFinalCents: Math.max(0, computedPricing.totalCents - (depositCentsTx ?? 0)),
            }
          : {}),
      });
    });

    if (finalPiToCancel) {
      try {
        const stripe = getStripe();
        await stripe.paymentIntents.cancel(finalPiToCancel);
      } catch (cancelErr) {
        const msg = cancelErr instanceof Error ? cancelErr.message : String(cancelErr);
        await writeOperationalAlert({
          type: "admin_reschedule_cancel_old_final_pi_failed",
          bookingId,
          paymentIntentId: finalPiToCancel,
          source: "admin-reschedule",
          error: msg.slice(0, 500),
        });
      }
    }

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

    if (preBooking.status === "paid" && priceDeltaCents < 0) {
      refundAmountCents = Math.abs(priceDeltaCents);
      const paymentIntentId = preBooking.stripe?.paymentIntentId;
      if (paymentIntentId) {
        refundPending = true;
        const prId = pendingRefundDocumentId({
          reason: "admin_reschedule_price_decrease_partial_refund",
          bookingId,
          paymentIntentId,
        });
        await db.collection("pendingRefunds").doc(prId).set(
          {
            bookingId,
            paymentIntentId,
            refundAmountCents,
            reason: "admin_reschedule_price_decrease_partial_refund",
            status: "pending",
            createdAt: Timestamp.now(),
            firstSeenAt: Timestamp.now(),
            nextRetryAt: Timestamp.now(),
            processorAttempts: 0,
          },
          { merge: true }
        );
        await writeOperationalAlert({
          type: "admin_reschedule_partial_refund_pending",
          bookingId,
          refundAmountCents,
          paymentIntentId,
          source: "admin-reschedule",
        });
      } else {
        await writeOperationalAlert({
          type: "admin_reschedule_partial_refund_missing_payment_intent",
          bookingId,
          refundAmountCents,
          source: "admin-reschedule",
        });
      }
    }

    const adminEmail = await getAdminEmailFromSessionCookie(request.headers.get("cookie"));
    void writeAdminAuditLog("booking_reschedule", {
      bookingId,
      oldSlotId: preBooking.slotId ?? null,
      newSlotId,
      oldPricingCents: currentTotalCents,
      newPricingCents: computedPricing.totalCents,
      summaryAdjustedCents,
      adminEmail,
    });

    return NextResponse.json({ ok: true, bookingId, slotId: newSlotId, refundPending, refundAmountCents });
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
    if (message === "RATE_NOT_FOUND") {
      return NextResponse.json({ error: "Requested rate was not found" }, { status: 404 });
    }
    if (message === "DURATION_MISMATCH") {
      return NextResponse.json({ error: "Requested slot duration does not match booking/rate duration" }, { status: 409 });
    }
    if (message === "PRICING_CHANGE_REQUIRES_CONFIRMATION") {
      return NextResponse.json(
        {
          error: "Reschedule changes booking total. Confirm pricing change to continue.",
          code: "PRICING_CHANGE_REQUIRES_CONFIRMATION",
          oldTotalCents: stripeStoredTotalCents ?? undefined,
          newTotalCents: computedPricing.totalCents,
        },
        { status: 409 }
      );
    }
    if (message === "FULLY_PAID_INCREASE_NOT_ALLOWED") {
      return NextResponse.json(
        {
          error:
            "Reschedule would increase price for a fully-paid booking. Collect the difference manually in Stripe before rescheduling.",
        },
        { status: 409 }
      );
    }
    if (message === "FINALIZED_DEPOSIT_SETTLEMENT_REQUIRED") {
      return NextResponse.json(
        {
          error:
            "Reschedule would change totals for a deposit booking that is already final-paid. Run the dedicated settlement workflow before changing totals.",
          code: "FINALIZED_DEPOSIT_SETTLEMENT_REQUIRED",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to reschedule booking" }, { status: 500 });
  }
}
