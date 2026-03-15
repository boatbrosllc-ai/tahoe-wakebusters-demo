/**
 * Regression: status=final_due with existing succeeded final PaymentIntent must not create a second charge.
 * The run-final-charges route reconciles booking to final_paid and skips when the existing PI already succeeded.
 * Tests use only real Stripe PaymentIntent statuses (no "refunded" — that is not a PI status).
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { existingFinalPiAction } from "../lib/booking/run-final-charges-action";

describe("run-final-charges existing final PaymentIntent", () => {
  it("succeeded existing intent returns reconcile so no second charge is created", () => {
    assert.strictEqual(existingFinalPiAction("succeeded"), "reconcile");
  });

  it("canceled existing intent allows creating new PaymentIntent", () => {
    assert.strictEqual(existingFinalPiAction("canceled"), "create");
  });

  it("non-terminal status skips to avoid duplicate work", () => {
    assert.strictEqual(existingFinalPiAction("requires_payment_method"), "skip");
    assert.strictEqual(existingFinalPiAction("requires_confirmation"), "skip");
    assert.strictEqual(existingFinalPiAction("requires_action"), "skip");
    assert.strictEqual(existingFinalPiAction("processing"), "skip");
    assert.strictEqual(existingFinalPiAction("requires_capture"), "skip");
  });
});
