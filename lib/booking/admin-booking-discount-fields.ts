import type { BookingPricing } from "./types";
import { computeFinalChargeTotalCentsFromHoldPricing } from "./hold-pricing-final-total";

export type BookingDiscountSource = {
  discountCode?: string | null;
  discountCents?: number | null;
};

/** Mirrors admin bookings list/detail API serialization (`discountCode` / `discountCents` → null when absent). */
export function pickAdminBookingDiscountFields(
  booking: BookingDiscountSource
): { discountCode: string | null; discountCents: number | null } {
  return {
    discountCode: booking.discountCode ?? null,
    discountCents: booking.discountCents ?? null,
  };
}

export type FinancialExportDiscountRow = {
  discountCode: string;
  discountUsd: string;
};

/** Mirrors admin bookings financial CSV export discount columns. */
export function formatAdminFinancialExportDiscount(
  booking: BookingDiscountSource
): FinancialExportDiscountRow {
  const discountCode = booking.discountCode ?? "";
  const discountUsd =
    typeof booking.discountCents === "number" && booking.discountCents > 0
      ? (booking.discountCents / 100).toFixed(2)
      : "";
  return { discountCode, discountUsd };
}

export type HoldPaymentDisplayInput = {
  pricing: BookingPricing;
  tipCents?: number | null;
  discountCents?: number | null;
};

/**
 * Charge total shown in admin payment surfaces and used by create-payment-intent
 * (`computeFinalChargeTotalCentsFromHoldPricing`) for hold/booking pricing snapshots.
 */
export function computeAdminHoldPaymentDisplayTotalCents(input: HoldPaymentDisplayInput): number {
  const tipCents = input.tipCents ?? 0;
  const discountCents = input.discountCents ?? 0;
  return computeFinalChargeTotalCentsFromHoldPricing(input.pricing, tipCents, discountCents);
}

/** create-hold stores `pricing.totalCents` as base + tip − discount after `computePricing()`. */
export function computeCreateHoldPricingTotalCents(
  pricingBaseTotalCents: number,
  tipCents: number,
  discountCents: number
): number {
  return Math.max(0, pricingBaseTotalCents + tipCents - discountCents);
}
