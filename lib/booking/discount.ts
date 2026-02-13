/**
 * Discount code validation and application.
 * Used at checkout to validate a code and compute discount amount.
 */

import type { Discount } from "./types";

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

/** Validate discount and compute discount amount for a given total. Returns valid + discountCents or invalid + error. */
export function validateAndApplyDiscount(
  discount: Discount | null,
  totalCents: number,
  now: Date = new Date()
): DiscountValidation {
  if (!discount) return { valid: false, error: "Invalid or expired code" };
  if (!discount.active) return { valid: false, error: "This code is no longer active" };
  if (discount.expiresAt) {
    const expiresAt = typeof discount.expiresAt === "object" && "toDate" in discount.expiresAt
      ? (discount.expiresAt as { toDate(): Date }).toDate()
      : new Date(0);
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
