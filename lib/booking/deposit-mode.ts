/**
 * Shared deposit/full-payment inference for receipt, email templates, and any consumer
 * that needs to decide whether a booking was paid as deposit or full.
 * Supports both status-driven and amount-driven detection so receipt and email channels agree.
 */

import type { Booking, BookingStatus } from "./types";

/** Statuses that indicate deposit flow (deposit paid or final balance due/paid). */
const DEPOSIT_STATUSES: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  "deposit_paid",
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
 * Uses two signals so we never show "full payment" when it was a deposit:
 * 1) Status-driven: status is in deposit flow (e.g. final_due, deposit_paid).
 * 2) Amount-driven: stripe.depositAmountCents is set and less than total (partial charge).
 */
export function isDepositMode(booking: Booking): boolean {
  const stripe = booking.stripe;
  if (stripe?.depositAmountCents == null) return false;
  const totalCents = stripe?.totalAmountCents ?? booking.pricing?.totalCents;
  const depositCents = stripe.depositAmountCents;
  if (DEPOSIT_STATUSES.has(booking.status)) return true;
  if (typeof totalCents === "number" && totalCents > 0 && depositCents < totalCents) return true;
  return false;
}
