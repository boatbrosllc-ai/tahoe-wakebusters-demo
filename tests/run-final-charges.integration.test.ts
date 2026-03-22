/**
 * Regression: status=final_due with existing succeeded final PaymentIntent must not create a second charge.
 * The run-final-charges route reconciles booking to final_paid and skips when the existing PI already succeeded.
 * With a stored finalPaymentIntentId, cron treats requires_payment_method / requires_confirmation as an in-flight
 * customer pay-remaining session only while customer locks are fresh; after lock expiry, cancel/clear recovers.
 * `hasStoredFinalPaymentIntentId: false` preserves the legacy cancel-and-recreate behavior for tests.
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

  it("default context: non-terminal incomplete statuses skip (avoid duplicate work)", () => {
    assert.strictEqual(existingFinalPiAction("requires_payment_method"), "skip");
    assert.strictEqual(existingFinalPiAction("requires_confirmation"), "skip");
    assert.strictEqual(existingFinalPiAction("requires_action"), "skip");
    assert.strictEqual(existingFinalPiAction("processing"), "skip");
    assert.strictEqual(existingFinalPiAction("requires_capture"), "skip");
  });

  it("cron context with stored final PI: incomplete customer-session statuses skip while customer locks are fresh", () => {
    assert.strictEqual(
      existingFinalPiAction("requires_payment_method", { context: "cron", hasStoredFinalPaymentIntentId: true }),
      "skip"
    );
    assert.strictEqual(
      existingFinalPiAction("requires_confirmation", { context: "cron", hasStoredFinalPaymentIntentId: true }),
      "skip"
    );
    assert.strictEqual(
      existingFinalPiAction("requires_payment_method", {
        context: "cron",
        hasStoredFinalPaymentIntentId: true,
        customerLocksFresh: true,
      }),
      "skip"
    );
    assert.strictEqual(
      existingFinalPiAction("requires_confirmation", {
        context: "cron",
        hasStoredFinalPaymentIntentId: true,
        customerLocksFresh: true,
      }),
      "skip"
    );
    assert.strictEqual(existingFinalPiAction("requires_payment_method", { context: "cron" }), "skip");
    assert.strictEqual(existingFinalPiAction("requires_confirmation", { context: "cron" }), "skip");
  });

  it("cron context with stored final PI: after customer lock expiry, incomplete intents map to create (recover)", () => {
    assert.strictEqual(
      existingFinalPiAction("requires_payment_method", {
        context: "cron",
        hasStoredFinalPaymentIntentId: true,
        customerLocksFresh: false,
      }),
      "create"
    );
    assert.strictEqual(
      existingFinalPiAction("requires_confirmation", {
        context: "cron",
        hasStoredFinalPaymentIntentId: true,
        customerLocksFresh: false,
      }),
      "create"
    );
  });

  it("cron context without stored PI id: recoverable incomplete intents map to create (cancel/clear path)", () => {
    assert.strictEqual(
      existingFinalPiAction("requires_payment_method", { context: "cron", hasStoredFinalPaymentIntentId: false }),
      "create"
    );
    assert.strictEqual(
      existingFinalPiAction("requires_confirmation", { context: "cron", hasStoredFinalPaymentIntentId: false }),
      "create"
    );
  });

  it("cron context: in-flight processing and customer action still skip", () => {
    assert.strictEqual(existingFinalPiAction("processing", { context: "cron" }), "skip");
    assert.strictEqual(existingFinalPiAction("requires_action", { context: "cron" }), "skip");
    assert.strictEqual(existingFinalPiAction("requires_capture", { context: "cron" }), "skip");
  });
});
