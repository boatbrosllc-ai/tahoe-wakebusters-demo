import { HOLD_EXPIRY_MINUTES } from "@/lib/booking/constants";

/**
 * After `expiresAt`, still allow `convertHoldToBooking` if Stripe confirms the PaymentIntent
 * succeeded within this window (race with hold cleanup / clock skew).
 */
export const HOLD_EXPIRY_GRACE_AFTER_PAYMENT_MS = 60_000;

/** Extra minutes when starting checkout (hosted or embedded session) so payment can complete. */
export const HOLD_CHECKOUT_SESSION_EXTENSION_MINUTES = 30;

/** Must match create-payment-intent: initial hold + one extension cap from `createdAt`. */
export const MAX_HOLD_LIFETIME_FROM_CREATED_MS =
  (HOLD_EXPIRY_MINUTES + HOLD_CHECKOUT_SESSION_EXTENSION_MINUTES) * 60 * 1000;
