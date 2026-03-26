/**
 * Re-export decision helper for existing final PaymentIntent (unit tests import this module).
 * @see final-charge-idempotency.ts
 *
 * Note: cron auto-remediation for long-lived `final_failed` bookings now lives in
 * `app/api/admin/cron/run-final-charges/route.ts` (`FINAL_FAILED_AUTO_CANCEL_DAYS`).
 */
export { existingFinalPiAction } from "@/lib/booking/final-charge-idempotency";
