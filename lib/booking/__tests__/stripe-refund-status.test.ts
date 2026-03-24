import { describe, it } from "node:test";
import assert from "node:assert";
import { classifyStripeRefundStatus } from "../stripe-refund-status";

describe("classifyStripeRefundStatus", () => {
  it("terminal success only for succeeded", () => {
    assert.strictEqual(classifyStripeRefundStatus("succeeded"), "terminal_success");
  });

  it("terminal failure for failed and canceled", () => {
    assert.strictEqual(classifyStripeRefundStatus("failed"), "terminal_failure");
    assert.strictEqual(classifyStripeRefundStatus("canceled"), "terminal_failure");
  });

  it("non-terminal for pending and requires_action", () => {
    assert.strictEqual(classifyStripeRefundStatus("pending"), "non_terminal");
    assert.strictEqual(classifyStripeRefundStatus("requires_action"), "non_terminal");
  });

  it("unknown status is treated as non-terminal (safe retry)", () => {
    assert.strictEqual(classifyStripeRefundStatus(undefined), "non_terminal");
  });
});
