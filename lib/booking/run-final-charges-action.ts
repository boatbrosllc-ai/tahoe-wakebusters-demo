/**
 * Decision logic for existing final PaymentIntent in run-final-charges cron.
 * Extracted so it can be unit-tested without importing server-only or Firebase.
 *
 * Uses only real Stripe PaymentIntent statuses: requires_payment_method, requires_confirmation,
 * requires_action, processing, requires_capture, canceled, succeeded. There is no "refunded"
 * status on PaymentIntent; refund handling is via charge.refunded / payment_intent.payment_failed
 * and booking-status updates elsewhere.
 *
 * - succeeded: reconcile booking state and skip (do not create a second charge).
 * - canceled: allow creating a new PaymentIntent.
 * - other (e.g. requires_payment_method, processing): skip to avoid duplicate work.
 */
export function existingFinalPiAction(status: string): "reconcile" | "skip" | "create" {
  if (status === "succeeded") return "reconcile";
  if (status === "canceled") return "create";
  return "skip";
}
