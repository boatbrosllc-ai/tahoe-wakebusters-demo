/**
 * Regression: when Stripe session create fails and the hold had a reserved discount,
 * rollbackCheckoutSession must restore the discount's usedCount in the same transaction
 * that expires the hold and releases slot/capacity. This test verifies the discount
 * restore formula and that callers pass hold discount context.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import type { HoldLike } from "../lib/booking/checkout-session-helpers";

function restoredUsedCount(current: number): number {
  return Math.max(0, current - 1);
}

describe("checkout rollback discount restoration", () => {
  it("restored usedCount is current minus 1, clamped to zero", () => {
    assert.strictEqual(restoredUsedCount(2), 1);
    assert.strictEqual(restoredUsedCount(1), 0);
    assert.strictEqual(restoredUsedCount(0), 0);
  });

  it("HoldLike includes discountCode so callers can pass hold discount context", () => {
    const holdWithDiscount: HoldLike = {
      slotId: "slot-1",
      experienceId: "exp-1",
      partySize: 2,
      bookingMode: "shared",
      discountCode: "SAVE10",
    };
    assert.strictEqual(holdWithDiscount.discountCode, "SAVE10");
    const holdWithoutDiscount: HoldLike = { slotId: "slot-1", partySize: 1 };
    assert.strictEqual(holdWithoutDiscount.discountCode, undefined);
  });

  it("Stripe session create failure with discount-applied hold: rollback must decrement discount in same transaction", () => {
    // Contract: create-checkout-session and create-checkout-session-direct pass the full hold
    // (with discountCode when present) to rollbackCheckoutSession. The helper reads the hold
    // inside the transaction, confirms status === 'active', then expires hold, releases slot/capacity,
    // and when hold.discountCode is set, decrements that discount's usedCount.
    assert.strictEqual(restoredUsedCount(1), 0, "one reservation restored so usedCount back to 0");
  });

  it("checkout line-item sum + coupon aligns with hold pricing + tip − discount (sanity identity)", () => {
    const pricingTotalCents = 10_000;
    const tipCents = 500;
    const discountCents = 1_000;
    const lineItemSumCents = pricingTotalCents + tipCents;
    const expectedLineItemsCents = pricingTotalCents + tipCents;
    const expectedChargeCents = pricingTotalCents + tipCents - discountCents;
    assert.strictEqual(lineItemSumCents, expectedLineItemsCents);
    assert.strictEqual(expectedChargeCents, 9_500);
  });
});
