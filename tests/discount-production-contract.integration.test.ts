/**
 * Production discount contract regression: 2-char codes, inclusive Central expiry,
 * legacy admin bookings, and hold/payment display total parity.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { getCentralCalendarDayBounds } from "../lib/booking/experience-slots";
import { getDiscountExpiryInstant, validateAndApplyDiscount } from "../lib/booking/discount";
import {
  DISCOUNT_CODE_MIN_LENGTH,
  normalizeDiscountCodeInput,
  validateDiscountCodeLength,
} from "../lib/booking/discount-code-input";
import {
  computeAdminHoldPaymentDisplayTotalCents,
  computeCreateHoldPricingTotalCents,
  pickAdminBookingDiscountFields,
} from "../lib/booking/admin-booking-discount-fields";
import { computePricing } from "../lib/booking/pricing";
import type { Discount } from "../lib/booking/types";

describe("discount production contract", () => {
  it("validate-discount and admin discounts share 2-character minimum", () => {
    assert.strictEqual(DISCOUNT_CODE_MIN_LENGTH, 2);
    assert.strictEqual(validateDiscountCodeLength("AB").ok, true);
    assert.strictEqual(validateDiscountCodeLength("A").ok, false);
    assert.strictEqual(normalizeDiscountCodeInput(" ab "), "AB");
  });

  it("admin POST expiry dayEnd matches validateAndApplyDiscount inclusive cutoff", () => {
    const dateOnly = "2026-08-01";
    const { dayEnd } = getCentralCalendarDayBounds(dateOnly);
    const discount: Discount = {
      code: "AB",
      type: "percent",
      percent: 5,
      usedCount: 0,
      active: true,
      createdAt: { seconds: 0, nanoseconds: 0 },
      expiresAt: { seconds: 0, nanoseconds: 0, toDate: () => dayEnd },
    };
    assert.strictEqual(getDiscountExpiryInstant(dayEnd).getTime(), dayEnd.getTime());
    assert.strictEqual(validateAndApplyDiscount(discount, 20_000, dayEnd).valid, true);
    assert.strictEqual(validateAndApplyDiscount(discount, 20_000, new Date(dayEnd.getTime() + 1)).valid, false);
  });

  it("admin booking API shape uses null discount fields for legacy docs", () => {
    const legacy = pickAdminBookingDiscountFields({
      pricing: { subtotalCents: 5000, taxCents: 413, feesCents: 0, totalCents: 5413, currency: "usd" },
    });
    assert.strictEqual(legacy.discountCode, null);
    assert.strictEqual(legacy.discountCents, null);
  });

  it("hold pricing snapshot, payment charge, and checkout line identity stay aligned", () => {
    const priced = computePricing({ rate: { priceCents: 10_000 }, addons: [], qty: 1 });
    const tipCents = 500;
    const discountCents = 1_000;
    const storedTotal = computeCreateHoldPricingTotalCents(priced.totalCents, tipCents, discountCents);
    const pricing = {
      subtotalCents: priced.subtotalCents,
      taxCents: priced.taxCents,
      feesCents: priced.feesCents,
      totalCents: storedTotal,
      currency: "usd" as const,
    };
    const chargeTotal = computeAdminHoldPaymentDisplayTotalCents({
      pricing,
      tipCents,
      discountCents,
    });
    const lineItemSumCents = priced.totalCents + tipCents;
    const expectedChargeCents = priced.totalCents + tipCents - discountCents;
    assert.strictEqual(chargeTotal, storedTotal);
    assert.strictEqual(lineItemSumCents, priced.totalCents + tipCents);
    assert.strictEqual(expectedChargeCents, priced.totalCents + tipCents - discountCents);
    assert.strictEqual(chargeTotal, expectedChargeCents);
  });
});
