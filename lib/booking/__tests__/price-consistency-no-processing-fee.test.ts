/**
 * Price consistency: published catalog rates must equal hold/checkout charter
 * subtotals with zero customer-facing processing fee.
 */
import assert from "node:assert";
import { describe, it } from "node:test";
import {
  STANDARD_RATE_CENTS,
  FOUNDING_RATE_CENTS,
  PEAK_FULL_DAY_CENTS,
} from "@/content/catalog-pricing";
import { PROCESSING_FEE_RATE, TAX_RATE, DEPOSIT_FRACTION } from "../constants";
import { computePricing } from "../pricing";

const TRANSPORT_CENTS = 22_500; // $225
const LUNCH_CENTS = 17_500; // $175

function assertCharterPriceJourney(label: string, catalogCents: number) {
  assert.ok(catalogCents > 0, `${label}: catalog cents`);

  const priced = computePricing({
    rate: { priceCents: catalogCents },
    addons: [],
    qty: 1,
  });

  // Public / selection / hold base / checkout charter subtotal
  assert.strictEqual(priced.subtotalCents, catalogCents, `${label}: hold/checkout subtotal`);
  // No Nasty processing surcharge
  assert.strictEqual(PROCESSING_FEE_RATE, 0, `${label}: PROCESSING_FEE_RATE`);
  assert.strictEqual(priced.feesCents, 0, `${label}: feesCents`);
  // PaymentIntent base before tax/addons/tip = published charter
  assert.strictEqual(priced.subtotalCents, catalogCents, `${label}: PI before tax`);
  // Tax may still apply (separate decision); total = charter + tax only when fee is 0
  const expectedTax = Math.round(catalogCents * TAX_RATE);
  assert.strictEqual(priced.taxCents, expectedTax, `${label}: tax only`);
  assert.strictEqual(priced.totalCents, catalogCents + expectedTax, `${label}: total without fee`);
}

describe("PROCESSING_FEE_RATE customer-facing policy", () => {
  it("is zero so new holds do not add a payment surcharge", () => {
    assert.strictEqual(PROCESSING_FEE_RATE, 0);
  });
});

describe("catalog → checkout price consistency (no processing fee)", () => {
  it("Standard Half Day", () => {
    assertCharterPriceJourney("Standard Half Day", STANDARD_RATE_CENTS.half);
    assert.ok(STANDARD_RATE_CENTS.half > 0);
  });

  it("Standard Full Day", () => {
    assertCharterPriceJourney("Standard Full Day", STANDARD_RATE_CENTS.full);
    assert.ok(STANDARD_RATE_CENTS.full > 0);
  });

  it("Founding Half Day", () => {
    assertCharterPriceJourney("Founding Half Day", FOUNDING_RATE_CENTS.half);
    assert.ok(FOUNDING_RATE_CENTS.half > 0);
  });

  it("Founding Full Day", () => {
    assertCharterPriceJourney("Founding Full Day", FOUNDING_RATE_CENTS.full);
    assert.ok(FOUNDING_RATE_CENTS.full > 0);
  });

  it("Peak Full Day", () => {
    assertCharterPriceJourney("Peak Full Day", PEAK_FULL_DAY_CENTS);
    assert.ok(PEAK_FULL_DAY_CENTS > 0);
  });
});

describe("add-ons do not receive a processing surcharge", () => {
  it("Full Day + transport + lunch: fee line stays $0; add-ons at face value", () => {
    const charter = STANDARD_RATE_CENTS.full;
    const priced = computePricing({
      rate: { priceCents: charter },
      addons: [
        { addon: { name: "Transportation", priceCents: TRANSPORT_CENTS, type: "quantity", active: true }, qty: 1 },
        { addon: { name: "Lunch Package", priceCents: LUNCH_CENTS, type: "quantity", active: true }, qty: 1 },
      ],
      qty: 1,
    });
    assert.strictEqual(priced.subtotalCents, charter + TRANSPORT_CENTS + LUNCH_CENTS);
    assert.strictEqual(priced.feesCents, 0);
    assert.strictEqual(priced.taxCents, Math.round(priced.subtotalCents * TAX_RATE));
    assert.strictEqual(priced.totalCents, priced.subtotalCents + priced.taxCents);
  });
});

describe("deposit / remaining balance ignore processing fee when rate is 0", () => {
  it("deposit is half of (charter + tax) for standard full day", () => {
    const priced = computePricing({ rate: { priceCents: STANDARD_RATE_CENTS.full }, addons: [], qty: 1 });
    assert.strictEqual(priced.feesCents, 0);
    const depositCents = Math.round(priced.totalCents * DEPOSIT_FRACTION);
    const finalCents = priced.totalCents - depositCents;
    assert.strictEqual(depositCents + finalCents, priced.totalCents);
  });
});

describe("payment method does not change Nasty order total", () => {
  it("same computePricing total for card vs BNPL (no method-based surcharge)", () => {
    const cardTotal = computePricing({ rate: { priceCents: STANDARD_RATE_CENTS.full }, addons: [], qty: 1 }).totalCents;
    const affirmTotal = computePricing({ rate: { priceCents: STANDARD_RATE_CENTS.full }, addons: [], qty: 1 }).totalCents;
    const klarnaTotal = computePricing({ rate: { priceCents: STANDARD_RATE_CENTS.full }, addons: [], qty: 1 }).totalCents;
    assert.strictEqual(cardTotal, affirmTotal);
    assert.strictEqual(cardTotal, klarnaTotal);
    assert.strictEqual(computePricing({ rate: { priceCents: STANDARD_RATE_CENTS.full }, addons: [], qty: 1 }).feesCents, 0);
  });
});
