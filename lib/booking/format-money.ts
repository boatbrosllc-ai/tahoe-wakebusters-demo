/**
 * Single source of truth for displaying money in emails and UI.
 * All amounts in the booking system are stored in CENTS.
 * Use this function whenever displaying a monetary value so we never show cents as dollars.
 */

/**
 * Format cents as a dollar string for display (e.g. "$175.00").
 * Input must be in cents. Use for all customer-facing amount display (emails, receipts, admin).
 */
export function formatMoney(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.round(cents) : 0;
  return `$${(safe / 100).toFixed(2)}`;
}

/**
 * Deposit, balance due, and similar — never show a leading minus (avoids looking like a charge reversal).
 */
export function formatMoneyNonNegative(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0;
  return `$${(safe / 100).toFixed(2)}`;
}
