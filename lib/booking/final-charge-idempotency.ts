/**
 * Shared final-charge idempotency and lock for manual (pay-remaining) and cron (run-final-charges).
 * One deterministic key per booking so only one PaymentIntent can be created regardless of source.
 */

/** One idempotency key per booking; used by both pay-remaining and run-final-charges. */
export function getFinalChargeIdempotencyKey(bookingId: string): string {
  return `final_charge_${bookingId}`;
}

/** Lock window: do not create a new final PaymentIntent if lock was set within this period (ms). */
export const FINAL_CHARGE_LOCK_SKIP_MS = 10 * 60 * 1000; // 10 min

export function isFinalChargeLockRecent(lockAt: { toDate(): Date } | { seconds: number } | undefined, now: Date): boolean {
  if (!lockAt) return false;
  const lockDate = "toDate" in lockAt && typeof lockAt.toDate === "function" ? lockAt.toDate() : new Date((lockAt as { seconds: number }).seconds * 1000);
  return now.getTime() - lockDate.getTime() < FINAL_CHARGE_LOCK_SKIP_MS;
}
