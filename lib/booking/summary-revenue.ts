import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { Booking } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";

/**
 * Total cents attributed to summaries/revenue for a booking (what was increment()ed and must be decrement()ed on cancel).
 * Deposit flow: deposit at conversion + final amount when final_paid (second increment).
 * Full / legacy: single total at conversion.
 */
/** Active bookings that contribute to admin financial totals (excludes canceled/refunded regardless of refund reconciliation). */
export function bookingCountsTowardActiveRevenueTotals(booking: Booking): boolean {
  return BOOKING_STATUSES_SLOT_TAKEN.has(booking.status as never);
}

export function totalSummaryAttributedRevenueCents(booking: Booking): number {
  const s = booking.stripe;
  const dep = s?.depositAmountCents;
  if (typeof dep === "number" && dep >= 0) {
    let total = dep;
    if (booking.status === "final_paid" && typeof s?.finalAmountCents === "number") {
      total += s.finalAmountCents;
    }
    return total;
  }
  return s?.totalAmountCents ?? booking.pricing?.totalCents ?? 0;
}

type FieldValueLike = { increment: (n: number) => unknown };

/** Second increment when the final balance is collected (deposit bookings only). */
export function applyFinalPaymentRevenueIncrement(
  tx: Transaction,
  db: Firestore,
  FieldValue: FieldValueLike,
  finalCents: number,
  booking?: Booking | null,
  bookingId?: string
): void {
  if (finalCents <= 0) return;
  if (booking?.stripe) {
    const total = booking.stripe.totalAmountCents ?? 0;
    const dep = booking.stripe.depositAmountCents ?? 0;
    const expectedFinal = total - dep;
    if (Number.isFinite(expectedFinal) && Math.abs(finalCents - expectedFinal) > 1) {
      console.warn("[summary-revenue] final revenue increment differs from stored total minus deposit", {
        finalCents,
        expectedFinal,
        totalAmountCents: total,
        depositAmountCents: dep,
        bookingId: bookingId ?? "",
      });
    }
  }
  const summaryRef = db.collection("summaries").doc("revenue");
  tx.set(
    summaryRef,
    { totalRevenueCents: FieldValue.increment(finalCents) },
    { merge: true }
  );
  const now = new Date();
  const monthKey = `revenue_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
  tx.set(
    db.collection("summaries").doc(monthKey),
    { revenueCents: FieldValue.increment(finalCents) },
    { merge: true }
  );
}
