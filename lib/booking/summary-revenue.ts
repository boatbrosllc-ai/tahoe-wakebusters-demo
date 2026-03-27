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

/** Firestore doc id under `summaries/` for per-experience revenue counters (e.g. experience_abc123). */
export const EXPERIENCE_SUMMARY_DOC_PREFIX = "experience_";

export function experienceSummaryDocumentId(experienceId: string): string {
  const id = experienceId.trim().replace(/[/\s]/g, "_");
  return `${EXPERIENCE_SUMMARY_DOC_PREFIX}${id}`;
}

/**
 * Month key for `summaries/revenue_YYYY_MM` — matches deposit booking-time bucket (see booking.summaryMonthKey).
 */
export function resolveRevenueSummaryMonthDocId(booking: Booking): string | null {
  const stored = typeof booking.summaryMonthKey === "string" ? booking.summaryMonthKey.trim() : "";
  if (stored) return stored;
  const createdAt = (booking as { createdAt?: { toDate?: () => Date } }).createdAt;
  const d = createdAt?.toDate?.();
  if (d) {
    return `revenue_${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return null;
}

type FieldValueLike = { increment: (n: number) => unknown };

/** Increment or decrement per-experience summary counters (forward-only until legacy backfill). */
export function applyExperienceRevenueDelta(
  tx: Transaction,
  db: Firestore,
  FieldValue: FieldValueLike,
  experienceId: string | undefined | null,
  revenueDeltaCents: number,
  bookingCountDelta: number
): void {
  const eid = typeof experienceId === "string" ? experienceId.trim() : "";
  if (!eid) return;
  if (revenueDeltaCents === 0 && bookingCountDelta === 0) return;
  const ref = db.collection("summaries").doc(experienceSummaryDocumentId(eid));
  const patch: Record<string, unknown> = {};
  if (revenueDeltaCents !== 0) {
    patch.revenueCents = FieldValue.increment(revenueDeltaCents);
  }
  if (bookingCountDelta !== 0) {
    patch.bookingCount = FieldValue.increment(bookingCountDelta);
  }
  tx.set(ref, patch, { merge: true });
}

/** Second increment when the final balance is collected (deposit bookings only). */
export function applyFinalPaymentRevenueIncrement(
  tx: Transaction,
  db: Firestore,
  FieldValue: FieldValueLike,
  finalCents: number,
  summaryMonthKey: string | null,
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
  const mk = typeof summaryMonthKey === "string" ? summaryMonthKey.trim() : "";
  if (mk) {
    tx.set(
      db.collection("summaries").doc(mk),
      { revenueCents: FieldValue.increment(finalCents) },
      { merge: true }
    );
  } else {
    console.warn("[summary-revenue] final payment monthly increment skipped — no summaryMonthKey", {
      bookingId: bookingId ?? "",
    });
  }
  if (booking?.experienceId) {
    applyExperienceRevenueDelta(tx, db, FieldValue, booking.experienceId, finalCents, 0);
  }
}
