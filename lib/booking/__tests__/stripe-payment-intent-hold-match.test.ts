/**
 * Regression: stale payment_intent.succeeded after hold reuse / intent reset must not match
 * the wrong hold intent id (deposit vs full, or superseded PI).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkoutIncomingMismatchAgainstHold,
  customerOverrideFromPaymentIntent,
  isPlaceholderCheckoutEmail,
  paymentIntentMatchesHoldForConversion,
} from "@/lib/booking/stripe-payment-intent-convert";
import { HOLD_PAYMENT_ATTEMPT_VERSION_META } from "@/lib/booking/constants";

const pricing = { pricing: { totalCents: 10_000 }, tipCents: 0, discountCents: 0 };
const v = (n: number) => ({ [HOLD_PAYMENT_ATTEMPT_VERSION_META]: String(n) });

describe("paymentIntentMatchesHoldForConversion", () => {
  it("allows full PI when hold records only fullPaymentIntentId and it matches", () => {
    const r = paymentIntentMatchesHoldForConversion(
      { id: "pi_new", metadata: { payment_stage: "full", ...v(1) }, amount: 10_000 },
      { fullPaymentIntentId: "pi_new", paymentAttemptVersion: 1 },
      pricing
    );
    assert.equal(r.ok, true);
  });

  it("rejects stale full PI after hold reset to a new final intent id", () => {
    const r = paymentIntentMatchesHoldForConversion(
      { id: "pi_old", metadata: { payment_stage: "full", ...v(1) }, amount: 10_000 },
      { fullPaymentIntentId: "pi_new", paymentAttemptVersion: 1 },
      pricing
    );
    assert.equal(r.ok, false);
  });

  it("rejects stale deposit PI when hold depositPaymentIntentId was reset", () => {
    const r = paymentIntentMatchesHoldForConversion(
      { id: "pi_stale_dep", metadata: { payment_stage: "deposit", ...v(1) }, amount: 5_000 },
      { depositPaymentIntentId: "pi_current_dep", fullPaymentIntentId: undefined, paymentAttemptVersion: 1 },
      pricing
    );
    assert.equal(r.ok, false);
  });

  it("allows deposit PI matching deposit field when full field is for a later stage", () => {
    const r = paymentIntentMatchesHoldForConversion(
      { id: "pi_dep", metadata: { payment_stage: "deposit", ...v(1) }, amount: 5_000 },
      { depositPaymentIntentId: "pi_dep", fullPaymentIntentId: "pi_full_later", paymentAttemptVersion: 1 },
      pricing
    );
    assert.equal(r.ok, true);
  });

  it("rejects orphan PI when any intent id is recorded on hold and neither matches", () => {
    const r = paymentIntentMatchesHoldForConversion(
      { id: "pi_orphan", metadata: { payment_stage: "full", ...v(1) }, amount: 10_000 },
      { depositPaymentIntentId: "pi_dep", fullPaymentIntentId: "pi_full", paymentAttemptVersion: 1 },
      pricing
    );
    assert.equal(r.ok, false);
  });

  it("rejects persist race when holdDocId is not supplied (ambiguous)", () => {
    const r = paymentIntentMatchesHoldForConversion(
      { id: "pi_first", metadata: { holdId: "hold_a", totalCents: "10000", ...v(1) }, amount: 10_000 },
      { paymentAttemptVersion: 1 },
      pricing
    );
    assert.equal(r.ok, false);
  });

  it("allows persist race when PI metadata holdId matches holdDocId", () => {
    const r = paymentIntentMatchesHoldForConversion(
      { id: "pi_first", metadata: { holdId: "hold_a", totalCents: "10000", ...v(1) }, amount: 10_000 },
      { paymentAttemptVersion: 1 },
      pricing,
      { holdDocId: "hold_a" }
    );
    assert.equal(r.ok, true);
  });

  it("rejects persist race when metadata holdId does not match holdDocId", () => {
    const r = paymentIntentMatchesHoldForConversion(
      { id: "pi_first", metadata: { holdId: "hold_other", totalCents: "10000", ...v(1) }, amount: 10_000 },
      { paymentAttemptVersion: 1 },
      pricing,
      { holdDocId: "hold_a" }
    );
    assert.equal(r.ok, false);
  });

  it("rejects PI when hold has no intent ids and legacy hold version (0) — both empty", () => {
    const r = paymentIntentMatchesHoldForConversion(
      { id: "pi_stale", metadata: { payment_stage: "full" }, amount: 10_000 },
      {},
      pricing
    );
    assert.equal(r.ok, false);
  });

  it("allows PI when metadata holdPaymentAttemptVersion lags hold but PI id is the one on the hold", () => {
    const r = paymentIntentMatchesHoldForConversion(
      { id: "pi_x", metadata: { payment_stage: "full", ...v(1) }, amount: 10_000 },
      { fullPaymentIntentId: "pi_x", paymentAttemptVersion: 2 },
      pricing
    );
    assert.equal(r.ok, true);
  });

  it("allows PI when holdPaymentAttemptVersion metadata is missing but PI id matches hold", () => {
    const r = paymentIntentMatchesHoldForConversion(
      { id: "pi_new", metadata: { payment_stage: "full" }, amount: 10_000 },
      { fullPaymentIntentId: "pi_new", paymentAttemptVersion: 1 },
      pricing
    );
    assert.equal(r.ok, true);
  });
});

describe("checkoutIncomingMismatchAgainstHold", () => {
  it("rejects when hold checkoutSessionId differs from incoming session id", () => {
    const r = checkoutIncomingMismatchAgainstHold(
      "cs_wrong",
      "pi_x",
      { id: "pi_x", metadata: { payment_stage: "full", ...v(1) }, amount: 10_000 },
      { checkoutSessionId: "cs_expected", fullPaymentIntentId: "pi_x", paymentAttemptVersion: 1 },
      pricing
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "checkout_session_id_mismatch");
  });

  it("allows when checkoutSessionId matches and PI matches hold intents", () => {
    const r = checkoutIncomingMismatchAgainstHold(
      "cs_expected",
      "pi_x",
      { id: "pi_x", metadata: { payment_stage: "full", ...v(1) }, amount: 10_000 },
      { checkoutSessionId: "cs_expected", fullPaymentIntentId: "pi_x", paymentAttemptVersion: 1 },
      pricing
    );
    assert.equal(r.ok, true);
  });

  it("rejects PI mismatch same as paymentIntentMatchesHoldForConversion", () => {
    const r = checkoutIncomingMismatchAgainstHold(
      "cs_1",
      "pi_stale",
      { id: "pi_stale", metadata: { payment_stage: "full", ...v(1) }, amount: 10_000 },
      { checkoutSessionId: "cs_1", fullPaymentIntentId: "pi_new", paymentAttemptVersion: 1 },
      pricing
    );
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "payment_intent_mismatch");
  });
});

describe("customerOverrideFromPaymentIntent", () => {
  it("prefers hold guest email over Stripe billing when both are non-placeholder", () => {
    const holdDraft = { name: "Pat Guest", email: "pat@example.com", phone: "+15550001111" };
    const pi = {
      id: "pi_test",
      payment_method: {
        billing_details: { email: "boatbrosllc@gmail.com", name: "Boat Bros LLC", phone: "" },
      },
      receipt_email: "boatbrosllc@gmail.com",
    };
    const r = customerOverrideFromPaymentIntent(pi as never, holdDraft);
    assert.ok(r);
    assert.equal(r!.email, "pat@example.com");
    assert.equal(r!.name, "Boat Bros LLC");
  });

  it("uses Stripe email when hold still has internal checkout placeholder", () => {
    const holdDraft = { name: "Pat", email: "checkout+abc@pending.internal", phone: "+15550001111" };
    const pi = {
      id: "pi_test",
      payment_method: {
        billing_details: { email: "patreal@example.com", name: "Pat Guest", phone: "" },
      },
      receipt_email: null,
    };
    const r = customerOverrideFromPaymentIntent(pi as never, holdDraft);
    assert.ok(r);
    assert.equal(r!.email, "patreal@example.com");
  });

  it("treats checkout@pending.local as placeholder for hold email", () => {
    assert.equal(isPlaceholderCheckoutEmail("checkout@pending.local"), true);
    assert.equal(isPlaceholderCheckoutEmail("Checkout@Pending.Local"), true);
  });
});
