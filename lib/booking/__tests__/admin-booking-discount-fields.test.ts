/**
 * Regression: admin booking discount serialization, CSV export, and hold/payment total parity.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { TAX_RATE } from "../constants";
import { computePricing } from "../pricing";
import {
  computeAdminHoldPaymentDisplayTotalCents,
  computeCreateHoldPricingTotalCents,
  formatAdminFinancialExportDiscount,
  pickAdminBookingDiscountFields,
} from "../admin-booking-discount-fields";

describe("pickAdminBookingDiscountFields", () => {
  it("returns null discount fields for legacy bookings without discount columns", () => {
    assert.deepStrictEqual(pickAdminBookingDiscountFields({}), {
      discountCode: null,
      discountCents: null,
    });
    assert.deepStrictEqual(
      pickAdminBookingDiscountFields({
        pricing: { subtotalCents: 10_000, taxCents: 825, feesCents: 0, totalCents: 10_825, currency: "usd" },
      }),
      { discountCode: null, discountCents: null }
    );
  });

  it("passes through stored discount code and cents", () => {
    assert.deepStrictEqual(
      pickAdminBookingDiscountFields({ discountCode: "SAVE10", discountCents: 1500 }),
      { discountCode: "SAVE10", discountCents: 1500 }
    );
  });
});

describe("formatAdminFinancialExportDiscount", () => {
  it("exports empty discount columns for bookings without a discount", () => {
    assert.deepStrictEqual(formatAdminFinancialExportDiscount({}), {
      discountCode: "",
      discountUsd: "",
    });
  });

  it("formats positive discount cents for financial CSV rows", () => {
    assert.deepStrictEqual(formatAdminFinancialExportDiscount({ discountCode: "AB", discountCents: 1234 }), {
      discountCode: "AB",
      discountUsd: "12.34",
    });
  });
});

describe("hold/payment display total parity", () => {
  it("create-hold stored pricing.totalCents matches create-payment-intent charge base", () => {
    const priced = computePricing({ rate: { priceCents: 10_000 }, addons: [], qty: 1 });
    const tipCents = 500;
    const discountCents = 1_000;
    const storedTotal = computeCreateHoldPricingTotalCents(priced.totalCents, tipCents, discountCents);

    const holdPricing = {
      subtotalCents: priced.subtotalCents,
      taxCents: priced.taxCents,
      feesCents: priced.feesCents,
      totalCents: storedTotal,
      currency: "usd" as const,
    };

    const chargeTotal = computeAdminHoldPaymentDisplayTotalCents({
      pricing: holdPricing,
      tipCents,
      discountCents,
    });

    assert.strictEqual(storedTotal, Math.max(0, priced.totalCents + tipCents - discountCents));
    assert.strictEqual(chargeTotal, storedTotal);
    assert.strictEqual(chargeTotal, priced.totalCents + tipCents - discountCents);
    assert.ok(Math.abs(priced.taxCents - Math.round(priced.subtotalCents * TAX_RATE)) <= 1);
  });

  it("legacy base-only pricing.totalCents still derives charge with tip and discount", () => {
    const priced = computePricing({ rate: { priceCents: 8000 }, addons: [], qty: 1 });
    const tipCents = 400;
    const discountCents = 800;
    const legacyPricing = {
      subtotalCents: priced.subtotalCents,
      taxCents: priced.taxCents,
      feesCents: priced.feesCents,
      totalCents: priced.totalCents,
      currency: "usd" as const,
    };
    const expected = Math.max(0, priced.totalCents + tipCents - discountCents);
    assert.strictEqual(
      computeAdminHoldPaymentDisplayTotalCents({
        pricing: legacyPricing,
        tipCents,
        discountCents,
      }),
      expected
    );
  });
});
