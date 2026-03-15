/**
 * Regression: resuming a previously discounted hold without a discount must clear discount fields
 * so subsequent payment creation (create-payment-intent) does not apply old discount amounts.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { sharedHoldResumeHasActiveDiscount } from "../lib/booking/hold-resume-discount";

describe("create-hold shared hold resume discount cleanup", () => {
  it("no discount on resume returns false so route clears discountCode, discountCents, stripeCouponId", () => {
    assert.strictEqual(sharedHoldResumeHasActiveDiscount(undefined, 0), false);
    assert.strictEqual(sharedHoldResumeHasActiveDiscount("", 0), false);
    assert.strictEqual(sharedHoldResumeHasActiveDiscount("CODE", 0), false);
    assert.strictEqual(sharedHoldResumeHasActiveDiscount(undefined, 500), false);
  });

  it("active discount on resume returns true so route sets discount fields", () => {
    assert.strictEqual(sharedHoldResumeHasActiveDiscount("SAVE10", 1000), true);
  });
});
