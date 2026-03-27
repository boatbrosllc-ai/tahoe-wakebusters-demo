import type { Firestore, Transaction, DocumentReference } from "firebase-admin/firestore";
import type { Booking } from "@/lib/booking/types";
import { applyFinalPaymentRevenueIncrement, resolveRevenueSummaryMonthDocId } from "@/lib/booking/summary-revenue";
import { addFinalChargeSuccessOutboxInTransaction } from "@/lib/booking/notification-outbox";
import { allowsTransition } from "@/lib/booking/transition-booking-status";

type FieldValueLike = {
  serverTimestamp: () => unknown;
  delete: () => unknown;
  increment: (n: number) => unknown;
};

type TimestampLike = {
  now: () => unknown;
};

export async function transitionToFinalPaid(
  tx: Transaction,
  db: Firestore,
  bookingRef: DocumentReference,
  booking: Booking,
  bookingId: string,
  finalPaymentIntentId: string,
  FieldValue: FieldValueLike,
  Timestamp: TimestampLike,
  overrideFinalCents?: number
): Promise<void> {
  if (booking.status === "canceled" || booking.status === "refunded") {
    return;
  }
  const sb = booking.stripe;
  const isDepositFlow = typeof sb?.depositAmountCents === "number";
  const finalRev = typeof sb?.finalAmountCents === "number" ? sb.finalAmountCents : 0;
  const alreadySummarized = sb?.finalRevenueSummaryApplied === true;
  const revenueForIncrement = overrideFinalCents ?? finalRev;
  const summaryMonthKey = resolveRevenueSummaryMonthDocId(booking);
  if (isDepositFlow && revenueForIncrement > 0 && !alreadySummarized) {
    applyFinalPaymentRevenueIncrement(tx, db, FieldValue, revenueForIncrement, summaryMonthKey, booking, bookingId);
  }
  const transitioning = booking.status !== "final_paid";
  if (transitioning && !allowsTransition(booking.status, "final_paid")) {
    throw new Error(`Illegal booking status transition to final_paid from ${booking.status}`);
  }
  tx.update(bookingRef, {
    ...(transitioning ? { status: "final_paid" } : {}),
    "stripe.finalPaymentIntentId": finalPaymentIntentId,
    "stripe.finalChargedAt": Timestamp.now(),
    "stripe.finalError": FieldValue.delete(),
    "stripe.customerFinalPiInFlightAt": FieldValue.delete(),
    "stripe.pendingFinalPaymentIntentKey": FieldValue.delete(),
    ...(isDepositFlow && revenueForIncrement > 0 && !alreadySummarized
      ? { "stripe.finalRevenueSummaryApplied": true }
      : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });
  if (transitioning) {
    await addFinalChargeSuccessOutboxInTransaction(tx, db, bookingId);
  }
}

export function resetBookingToFinalDue(
  tx: Transaction,
  bookingRef: DocumentReference,
  FieldValue: FieldValueLike,
  Timestamp: TimestampLike
): void {
  tx.update(bookingRef, {
    status: "final_due",
    "stripe.finalPaymentIntentId": FieldValue.delete(),
    "stripe.pendingFinalPaymentIntentKey": FieldValue.delete(),
    "stripe.customerFinalPiInFlightAt": FieldValue.delete(),
    updatedAt: Timestamp.now(),
  });
}
