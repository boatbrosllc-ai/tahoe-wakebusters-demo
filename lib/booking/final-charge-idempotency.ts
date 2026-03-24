/**
 * Shared final-charge idempotency and lock for manual (pay-remaining) and cron (run-final-charges).
 * Separate key namespaces per source so Stripe idempotency is not shared across different PI parameters.
 */

export type FinalChargeIdempotencySource = "cron" | "customer";

/** Distinguishes off-session vs Payment Element PI creation so two Stripe calls never share one idempotency key. */
export type FinalChargeIdempotencyAttempt = "off-session" | "element";

/** Deterministic key per booking, charge path, and amount (avoids Stripe replaying a stale amount within idempotency window). */
export function getFinalChargeIdempotencyKey(
  bookingId: string,
  source: FinalChargeIdempotencySource,
  attempt?: FinalChargeIdempotencyAttempt,
  amountCents?: number
): string {
  const amt =
    amountCents != null && Number.isFinite(amountCents) ? Math.max(0, Math.round(amountCents)) : 0;
  const base = `final_charge_${bookingId}_${source}_${amt}`;
  if (attempt === "off-session") return `${base}:off-session`;
  if (attempt === "element") return `${base}:element`;
  return base;
}

/** Lock window: do not create a new final PaymentIntent if lock was set within this period (ms). */
export const FINAL_CHARGE_LOCK_SKIP_MS = 10 * 60 * 1000; // 10 min

/** While customer pay-remaining is active, cron must not cancel/recreate this intent (ms). */
export const CUSTOMER_PAY_LOCK_SKIP_MS = 30 * 60 * 1000; // 30 min

/**
 * Customer path sets this in Firestore before calling Stripe to create a final PI so cron cannot race into a second PI.
 * Cleared after success (PI id written) or on failure; ages out if the handler crashes mid-flight.
 */
export const CUSTOMER_FINAL_PI_IN_FLIGHT_MS = 15 * 60 * 1000; // 15 min

function lockTimestampToDate(lockAt: { toDate(): Date } | { seconds: number } | undefined): Date | null {
  if (!lockAt) return null;
  return "toDate" in lockAt && typeof lockAt.toDate === "function"
    ? lockAt.toDate()
    : new Date((lockAt as { seconds: number }).seconds * 1000);
}

export function isFinalChargeLockRecent(lockAt: { toDate(): Date } | { seconds: number } | undefined, now: Date): boolean {
  const lockDate = lockTimestampToDate(lockAt);
  if (!lockDate) return false;
  return now.getTime() - lockDate.getTime() < FINAL_CHARGE_LOCK_SKIP_MS;
}

export function isCustomerPayLockRecent(lockAt: { toDate(): Date } | { seconds: number } | undefined, now: Date): boolean {
  const lockDate = lockTimestampToDate(lockAt);
  if (!lockDate) return false;
  return now.getTime() - lockDate.getTime() < CUSTOMER_PAY_LOCK_SKIP_MS;
}

export function isCustomerFinalPiInFlightRecent(
  at: { toDate(): Date } | { seconds: number } | undefined,
  now: Date
): boolean {
  const d = lockTimestampToDate(at);
  if (!d) return false;
  return now.getTime() - d.getTime() < CUSTOMER_FINAL_PI_IN_FLIGHT_MS;
}

/**
 * Decision for an existing final PaymentIntent in run-final-charges cron (and tests).
 * When `hasStoredFinalPaymentIntentId` is true (normal case: Firestore already references this PI),
 * `requires_payment_method` / `requires_confirmation` are skipped only while customer locks are fresh
 * (pay-remaining or in-flight PI). After lock expiry, cron may cancel/clear the stale intent and
 * create an off-session charge. When `hasStoredFinalPaymentIntentId` is false, cron may cancel and
 * recreate (legacy / tests). If `customerLocksFresh` is omitted, it defaults to true so callers that
 * do not pass it keep the conservative skip behavior.
 */
export function existingFinalPiAction(
  status: string,
  options?: {
    context?: "cron" | "default";
    hasStoredFinalPaymentIntentId?: boolean;
    /** When false, stale customer-flow intents are eligible for cancel/clear + off-session retry. */
    customerLocksFresh?: boolean;
  }
): "reconcile" | "skip" | "create" {
  if (status === "succeeded") return "reconcile";
  if (status === "canceled") return "create";
  const hasStored = options?.hasStoredFinalPaymentIntentId !== false;
  if (
    options?.context === "cron" &&
    (status === "requires_payment_method" || status === "requires_confirmation")
  ) {
    if (!hasStored) return "create";
    const locksFresh = options.customerLocksFresh ?? true;
    if (locksFresh) return "skip";
    return "create";
  }
  return "skip";
}
