import { describe, it } from "node:test";
import assert from "node:assert";
import {
  buildAdminCancelRefundIdempotencyKey,
  buildCheckoutSessionIdempotencyKey,
  buildPaymentIntentIdempotencyKey,
} from "../stripe-idempotency-keys";

describe("stripe idempotency keys (hold payment attempt version)", () => {
  it("payment intent key differs when holdPaymentAttemptVersion increments (resume-safe)", () => {
    const base = { holdId: "hold_abc", payFullAmount: false, chargeCents: 5000 };
    const k1 = buildPaymentIntentIdempotencyKey({ ...base, holdPaymentAttemptVersion: 1 });
    const k2 = buildPaymentIntentIdempotencyKey({ ...base, holdPaymentAttemptVersion: 2 });
    assert.notStrictEqual(k1, k2);
    assert.match(k1, /-v1$/);
    assert.match(k2, /-v2$/);
  });

  it("payment intent key keeps stage and amount separation with version", () => {
    const holdId = "hold_x";
    const dep = buildPaymentIntentIdempotencyKey({
      holdId,
      payFullAmount: false,
      chargeCents: 3000,
      holdPaymentAttemptVersion: 1,
    });
    const full = buildPaymentIntentIdempotencyKey({
      holdId,
      payFullAmount: true,
      chargeCents: 9000,
      holdPaymentAttemptVersion: 1,
    });
    assert.notStrictEqual(dep, full);
    assert.ok(dep.includes("-deposit-3000-v1"));
    assert.ok(full.includes("-full-9000-v1"));
  });

  it("checkout session key differs embedded vs redirect at same version", () => {
    const holdId = "hold_cs";
    const emb = buildCheckoutSessionIdempotencyKey({ holdId, embedded: true, holdPaymentAttemptVersion: 1 });
    const redir = buildCheckoutSessionIdempotencyKey({ holdId, embedded: false, holdPaymentAttemptVersion: 1 });
    assert.notStrictEqual(emb, redir);
    assert.ok(emb.includes("-emb-v1"));
    assert.ok(redir.includes("-redir-v1"));
  });

  it("checkout session key differs when version increments (hold resume)", () => {
    const holdId = "hold_resume";
    const a = buildCheckoutSessionIdempotencyKey({ holdId, embedded: true, holdPaymentAttemptVersion: 1 });
    const b = buildCheckoutSessionIdempotencyKey({ holdId, embedded: true, holdPaymentAttemptVersion: 2 });
    assert.notStrictEqual(a, b);
  });

  it("admin cancel refund idempotency key matches pendingRefund doc id (processor-safe)", () => {
    const docId = "pr_abc123deadbeef";
    assert.strictEqual(buildAdminCancelRefundIdempotencyKey(docId), docId);
  });
});
