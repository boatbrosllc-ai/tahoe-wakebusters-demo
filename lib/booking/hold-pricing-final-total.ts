/**
 * Derive the final charge total (pre-Stripe) from hold pricing + tip/discount.
 * New holds store `pricing.totalCents` as base + tax + fees + tip − discount; legacy holds store base-only in `totalCents`.
 */
import type { BookingPricing } from "./types";

export function computeFinalChargeTotalCentsFromHoldPricing(
  pricing: BookingPricing,
  tipCents: number,
  discountCents: number
): number {
  const tip = Number.isFinite(tipCents) ? Math.max(0, Math.floor(tipCents)) : 0;
  const disc = Number.isFinite(discountCents) ? Math.max(0, Math.floor(discountCents)) : 0;
  const base = pricing.subtotalCents + pricing.taxCents + pricing.feesCents;
  const derivedFinal = Math.max(0, base + tip - disc);
  if (Math.abs(pricing.totalCents - derivedFinal) <= 1) {
    return pricing.totalCents;
  }
  if (Math.abs(pricing.totalCents - base) <= 1) {
    return derivedFinal;
  }
  return Math.max(0, pricing.totalCents + tip - disc);
}
