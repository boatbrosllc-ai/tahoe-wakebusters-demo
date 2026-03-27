/**
 * Processing timeout and terminal-failure copy for complete-after-payment.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import type Stripe from "stripe";
import {
  pollHardTimeoutMsForProcessingPaymentIntent,
  paymentIntentTerminalFailureCopy,
  POLL_HARD_TIMEOUT_ASYNC_MS,
  POLL_HARD_TIMEOUT_SYNC_MS,
} from "../complete-after-payment-pi-policy";

function pi(partial: Partial<Stripe.PaymentIntent>): Stripe.PaymentIntent {
  return {
    id: "pi_test",
    object: "payment_intent",
    ...partial,
  } as Stripe.PaymentIntent;
}

describe("pollHardTimeoutMsForProcessingPaymentIntent", () => {
  it("uses async timeout for us_bank_account", () => {
    const ms = pollHardTimeoutMsForProcessingPaymentIntent(
      pi({
        payment_method: { id: "pm_1", object: "payment_method", type: "us_bank_account" } as Stripe.PaymentMethod,
      })
    );
    assert.strictEqual(ms, POLL_HARD_TIMEOUT_ASYNC_MS);
  });

  it("uses async timeout when payment method type is unknown (expanded object missing)", () => {
    const ms = pollHardTimeoutMsForProcessingPaymentIntent(pi({ payment_method: "pm_x" }));
    assert.strictEqual(ms, POLL_HARD_TIMEOUT_ASYNC_MS);
  });

  it("uses sync timeout for card", () => {
    const ms = pollHardTimeoutMsForProcessingPaymentIntent(
      pi({
        payment_method: { id: "pm_1", object: "payment_method", type: "card" } as Stripe.PaymentMethod,
      })
    );
    assert.strictEqual(ms, POLL_HARD_TIMEOUT_SYNC_MS);
  });

  it("uses async timeout when next_action implies redirect", () => {
    const ms = pollHardTimeoutMsForProcessingPaymentIntent(
      pi({
        payment_method: { id: "pm_1", object: "payment_method", type: "card" } as Stripe.PaymentMethod,
        next_action: { type: "redirect_to_url", redirect_to_url: { url: "https://x", return_url: "https://y" } },
      })
    );
    assert.strictEqual(ms, POLL_HARD_TIMEOUT_ASYNC_MS);
  });
});

describe("paymentIntentTerminalFailureCopy", () => {
  it("returns explicit copy for canceled", () => {
    const c = paymentIntentTerminalFailureCopy("canceled");
    assert(c);
    assert.match(c.headline, /canceled/i);
    assert.match(c.recovery, /new booking/i);
  });

  it("returns explicit copy for requires_payment_method", () => {
    const c = paymentIntentTerminalFailureCopy("requires_payment_method");
    assert(c);
    assert.match(c.headline, /did not go through/i);
  });

  it("returns explicit copy for requires_action", () => {
    const c = paymentIntentTerminalFailureCopy("requires_action");
    assert(c);
    assert.match(c.headline, /finish/i);
  });

  it("returns null for processing (handled by 202 branch)", () => {
    assert.strictEqual(paymentIntentTerminalFailureCopy("processing"), null);
  });
});
