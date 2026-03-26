import type { Firestore } from "firebase-admin/firestore";
import type { CollectionReference, DocumentData } from "firebase-admin/firestore";

/**
 * Stripe webhook deliveries: max transient retries before permanent failure / ops escalation.
 * Stripe retries failed webhook deliveries for an extended window (on the order of hours, with backoff over
 * roughly three days). A threshold of 3 can dead-letter legitimate bookings when transient infra issues cluster
 * in the first day — use at least 5 so a few hours of retries still return 500 to Stripe.
 */
export const STRIPE_WEBHOOK_TRANSIENT_RETRY_THRESHOLD = 5;

/** Extra retries when payment_intent.succeeded arrives before hold metadata is visible (Firestore propagation). */
export const STRIPE_WEBHOOK_PI_HOLD_MISSING_RETRY_THRESHOLD = 8;

/** Firestore fields on `stripeEvents/{eventId}` — one counter per retryable failure path. */
export const WH_RETRY_CHECKOUT_ACTIVE_HOLD_NO_HOLD_ID = "whRetry_checkoutActiveHoldNoHoldId";
export const WH_RETRY_CHECKOUT_ACTIVE_HOLD_HOLD_NOT_FOUND = "whRetry_checkoutActiveHoldHoldNotFound";
export const WH_RETRY_CHECKOUT_ACTIVE_HOLD_HOLD_NOT_ACTIVE = "whRetry_checkoutActiveHoldHoldNotActive";
export const WH_RETRY_CHECKOUT_ACTIVE_HOLD_NO_PI = "whRetry_checkoutActiveHoldNoPi";
export const WH_RETRY_CHECKOUT_ACTIVE_HOLD_CONVERT_ERR = "whRetry_checkoutActiveHoldConvertErr";

export const WH_RETRY_CHECKOUT_CONVERTED_HOLD_NOT_FOUND = "whRetry_asyncCheckoutHoldNotFound";
export const WH_RETRY_CHECKOUT_CONVERTED_MISSING_HOLD_ID = "whRetry_asyncCheckoutMissingHoldId";
export const WH_RETRY_CHECKOUT_CONVERTED_NO_PI = "whRetry_asyncConvertedHoldNoPi";
export const WH_RETRY_CHECKOUT_CONVERTED_CONVERT_ERR = "whRetry_asyncCheckoutConvertErr";

/** Back-compat aliases (same field strings) for imports from the Stripe webhook route. */
export const WH_RETRY_ASYNC_CHECKOUT_HOLD_NOT_FOUND = WH_RETRY_CHECKOUT_CONVERTED_HOLD_NOT_FOUND;
export const WH_RETRY_ASYNC_CHECKOUT_MISSING_HOLD_ID = WH_RETRY_CHECKOUT_CONVERTED_MISSING_HOLD_ID;
export const WH_RETRY_ASYNC_CONVERTED_HOLD_NO_PI = WH_RETRY_CHECKOUT_CONVERTED_NO_PI;
export const WH_RETRY_ASYNC_CHECKOUT_CONVERT_ERR = WH_RETRY_CHECKOUT_CONVERTED_CONVERT_ERR;

export const WH_RETRY_CHECKOUT_COMPLETED_HOLD_NOT_FOUND = "checkoutCompletedHoldNotFoundRetryCount";
export const WH_RETRY_CHECKOUT_COMPLETED_NO_PI = "whRetry_checkoutCompletedNoPi";
export const WH_RETRY_ASYNC_PAYMENT_NOT_PAID = "whRetry_asyncPaymentNotPaidStatus";

export const WH_RETRY_FINAL_PI_MISSING_BOOKING_ID = "whRetry_finalPiMissingBookingId";
export const WH_RETRY_FINAL_BOOKING_DOC_NOT_FOUND = "whRetry_finalBookingDocNotFound";

/** Legacy field name (keep for existing event docs). */
export const WH_RETRY_PI_SUCCEEDED_HOLD_MISSING = "piSucceededMissingHoldRetryCount";

export const WH_RETRY_PI_SUCCEEDED_CONVERT_ERR = "whRetry_piSucceededConvertErr";

/**
 * Increments the per-path retry counter for this webhook delivery and returns the new attempt number.
 */
export async function incrementStripeWebhookRetryCounter(
  db: Firestore,
  eventsRef: CollectionReference<DocumentData>,
  eventId: string,
  counterField: string
): Promise<number> {
  return db.runTransaction(async (tx) => {
    const ref = eventsRef.doc(eventId);
    const snap = await tx.get(ref);
    const current = Number(snap.data()?.[counterField] ?? 0);
    const next = current + 1;
    tx.set(ref, { [counterField]: next }, { merge: true });
    return next;
  });
}

/**
 * While true, return non-2xx to Stripe so delivery retries. Once false, run terminal escalation and return 2xx.
 */
export function webhookTransientFailureShouldRetry(
  attempt: number,
  threshold: number = STRIPE_WEBHOOK_TRANSIENT_RETRY_THRESHOLD
): boolean {
  return attempt <= threshold;
}
