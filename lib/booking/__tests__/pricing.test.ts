/**
 * Unit tests for pricing helpers, including Thanksgiving holiday window edge case and computePricing.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { isDefaultUSHoliday, computePricing } from "../pricing";

describe("isDefaultUSHoliday", () => {
  it("classifies Thanksgiving (fourth Thursday) and following days as holiday, cap at 30", () => {
    // 2024: Nov 1 is Friday → first Thu = 7, fourth Thu = 28. Thanksgiving = Nov 28.
    assert.strictEqual(isDefaultUSHoliday("2024-11-28"), true, "Nov 28 (Thanksgiving)");
    assert.strictEqual(isDefaultUSHoliday("2024-11-29"), true, "Nov 29 (day after)");
    assert.strictEqual(isDefaultUSHoliday("2024-11-30"), true, "Nov 30 (Saturday)");
  });

  it("does not overflow into December when Thanksgiving falls late (e.g. Nov 28)", () => {
    // Upper bound is Math.min(fourthThu + 3, 30), so Nov 28–30 are holiday; Dec 1 is not from this rule
    assert.strictEqual(isDefaultUSHoliday("2024-12-01"), false);
  });
});

describe("computePricing", () => {
  const TAX_RATE = 0.0825;

  it("computes correct subtotal, tax, and total for a normal rate with qty 1", () => {
    const rate = { priceCents: 10000 };
    const result = computePricing({ rate, addons: [], qty: 1 });
    const expectedTax = Math.round(10000 * TAX_RATE);
    assert.strictEqual(result.subtotalCents, 10000);
    assert.strictEqual(result.taxCents, expectedTax);
    assert.strictEqual(result.totalCents, 10000 + expectedTax);
    assert.strictEqual(result.currency, "usd");
  });

  it("computes totalCents = priceCents * 4 + tax for ticketed qty 4", () => {
    const priceCents = 3500;
    const rate = { priceCents };
    const result = computePricing({ rate, addons: [], qty: 4 });
    const expectedSubtotal = priceCents * 4;
    const expectedTax = Math.round(expectedSubtotal * TAX_RATE);
    assert.strictEqual(result.subtotalCents, expectedSubtotal);
    assert.strictEqual(result.taxCents, expectedTax);
    assert.strictEqual(result.totalCents, expectedSubtotal + expectedTax);
  });

  it("when priceCents is undefined, treats as 0 and returns zero subtotal/tax/total", () => {
    const rate = { priceCents: undefined } as { priceCents?: number };
    const result = computePricing({ rate, addons: [], qty: 1 });
    assert.strictEqual(result.subtotalCents, 0);
    assert.strictEqual(result.taxCents, 0);
    assert.strictEqual(result.totalCents, 0);
  });

  it("when priceCents is 0, returns explicit zero result (documented zero-price case)", () => {
    const rate = { priceCents: 0 };
    const result = computePricing({ rate, addons: [], qty: 1 });
    assert.strictEqual(result.subtotalCents, 0);
    assert.strictEqual(result.taxCents, 0);
    assert.strictEqual(result.totalCents, 0);
  });
});
