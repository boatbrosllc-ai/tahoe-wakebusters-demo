/**
 * Shared deposit/full-payment inference for receipt, email templates, and any consumer
 * that needs to decide whether a booking was paid as deposit or full.
 * Supports both status-driven and amount-driven detection so receipt and email channels agree.
 */

import type { Booking, BookingStatus } from "./types";

/** Statuses that indicate deposit flow (final balance due/paid). At runtime only final_due, final_processing, final_paid, final_requires_action, final_failed are assigned; deposit_paid is not used. */
const DEPOSIT_STATUSES: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  "final_due",
  "final_processing",
  "final_paid",
  "final_requires_action",
  "final_failed",
]);

/**
 * Single source of truth for deposit vs full-payment mode from a booking record.
 * Used by receipt API and email templates so messaging is consistent.
 *
 * When status is in DEPOSIT_STATUSES, treat as deposit only if `stripe.depositAmountCents` is present
 * (evidence of the 50/50 flow). If that field is missing on a final_* status, emit an ops alert and
 * fall through to the amount-driven check. Otherwise use amount-driven signal: deposit set and less than total.
 */
export function isDepositMode(booking: Booking): boolean {
  const stripe = booking.stripe;
  if (DEPOSIT_STATUSES.has(booking.status)) {
    if (stripe?.depositAmountCents == null) {
      void import("./operational-alerts")
        .then(({ writeOperationalAlert }) =>
          writeOperationalAlert({
            type: "deposit_mode_missing_deposit_amount_cents",
            status: booking.status,
            ...(typeof stripe?.depositPaymentIntentId === "string" && stripe.depositPaymentIntentId.trim()
              ? { depositPaymentIntentId: stripe.depositPaymentIntentId.trim() }
              : {}),
          })
        )
        .catch(() => {});
    } else {
      return true;
    }
  }
  if (stripe?.depositAmountCents == null) return false;
  const totalCents = stripe?.totalAmountCents ?? booking.pricing?.totalCents;
  const depositCents = stripe.depositAmountCents;
  if (typeof totalCents === "number" && totalCents > 0 && depositCents < totalCents) return true;
  return false;
}
