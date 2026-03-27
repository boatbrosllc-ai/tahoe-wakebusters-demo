import { HOLD_EXPIRY_MINUTES } from "@/lib/booking/constants";

/**
 * After `expiresAt`, still allow `convertHoldToBooking` if Stripe confirms the PaymentIntent
 * succeeded within this window (race with hold cleanup / clock skew).
 */
export const HOLD_EXPIRY_GRACE_AFTER_PAYMENT_MS = 900_000;

/**
 * If a PaymentIntent for this hold has already succeeded, allow conversion up to this long after
 * `expiresAt` so paid customers are not stranded when checkout overruns the hold clock (async methods,
 * delays, or reconciliation). Beyond this window we still reject to limit stale inventory risk.
 */
export const HOLD_SUCCEEDED_CONVERSION_MAX_PAST_EXPIRY_MS = 48 * 60 * 60 * 1000;

/** Extra minutes when starting checkout (hosted or embedded session) so payment can complete. */
export const HOLD_CHECKOUT_SESSION_EXTENSION_MINUTES = 30;

/** Must match create-payment-intent: initial hold + one extension cap from `createdAt`. */
export const MAX_HOLD_LIFETIME_FROM_CREATED_MS =
  (HOLD_EXPIRY_MINUTES + HOLD_CHECKOUT_SESSION_EXTENSION_MINUTES) * 60 * 1000;
