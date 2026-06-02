/**
 * Discount code validation and application.
 * Used at checkout to validate a code and compute discount amount.
 *
 * Note: usedCount vs maxRedemptions is also checked inside the Firestore transaction
 * that creates the hold (create-hold) and at conversion time (convert-hold-to-booking).
 * A race remains possible (concurrent holds can both pass validation; one will fail at
 * conversion). convert-hold-to-booking surfaces a user-friendly error with a path to
 * rebook without the discount.
 */

import { getCentralCalendarDayBounds, getDateStrInSlotTimezone } from "./experience-slots";
import type { Discount } from "./types";

/** Expiry is inclusive through end of the selected calendar day (America/Chicago). */
export function getDiscountExpiryInstant(expiresAt: Date): Date {
  const dateStr = getDateStrInSlotTimezone(expiresAt);
  return getCentralCalendarDayBounds(dateStr).dayEnd;
}

export interface DiscountValidationResult {
  valid: true;
  discount: Discount;
  discountCents: number;
}

export interface DiscountValidationInvalid {
  valid: false;
  error: string;
}

export type DiscountValidation = DiscountValidationResult | DiscountValidationInvalid;

/**
 * Validate discount and compute discount amount.
 * Discount base = `pricing.totalCents` (subtotal before tip including tax and fees, excluding tip and discount). Must match `computePricing()` output.
 */
export function validateAndApplyDiscount(
  discount: Discount | null,
  totalCents: number,
  now: Date = new Date()
): DiscountValidation {
  if (!discount) return { valid: false, error: "Invalid or expired code" };
  if (!discount.active) return { valid: false, error: "This code is no longer active" };
  if (discount.expiresAt) {
    const expiresAtRaw = typeof discount.expiresAt === "object" && "toDate" in discount.expiresAt
      ? (discount.expiresAt as { toDate(): Date }).toDate()
      : new Date(0);
    const expiresAt = getDiscountExpiryInstant(expiresAtRaw);
    if (now > expiresAt) return { valid: false, error: "This code has expired" };
  }
  if (typeof discount.maxRedemptions === "number" && discount.usedCount >= discount.maxRedemptions) {
    return { valid: false, error: "This code has reached its usage limit" };
  }
  if (totalCents <= 0) return { valid: false, error: "No amount to discount" };

  let discountCents: number;
  if (discount.type === "percent" && typeof discount.percent === "number" && discount.percent > 0 && discount.percent <= 100) {
    discountCents = Math.floor((totalCents * discount.percent) / 100);
  } else if (discount.type === "fixed" && typeof discount.valueCents === "number" && discount.valueCents > 0) {
    discountCents = Math.min(discount.valueCents, totalCents);
  } else {
    return { valid: false, error: "Invalid discount configuration" };
  }

  if (discountCents <= 0) return { valid: false, error: "No discount applies to this amount" };

  return { valid: true, discount, discountCents };
}
