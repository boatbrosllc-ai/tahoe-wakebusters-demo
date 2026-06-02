import { describe, it } from "node:test";
import assert from "node:assert";
import { computePricing } from "../pricing";
import { computeFinalChargeTotalCentsFromHoldPricing } from "../hold-pricing-final-total";
import { computeCreateHoldPricingTotalCents } from "../admin-booking-discount-fields";

describe("computeFinalChargeTotalCentsFromHoldPricing", () => {
  it("matches create-hold snapshot totals for discounted holds with tip", () => {
    const priced = computePricing({ rate: { priceCents: 12_000 }, addons: [], qty: 1 });
    const tipCents = 600;
    const discountCents = 1200;
    const storedTotal = computeCreateHoldPricingTotalCents(priced.totalCents, tipCents, discountCents);
    const pricing = {
      subtotalCents: priced.subtotalCents,
      taxCents: priced.taxCents,
      feesCents: priced.feesCents,
      totalCents: storedTotal,
      currency: "usd" as const,
    };
    assert.strictEqual(
      computeFinalChargeTotalCentsFromHoldPricing(pricing, tipCents, discountCents),
      storedTotal
    );
  });
});
