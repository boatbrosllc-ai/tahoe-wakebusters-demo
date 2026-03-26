/**
 * PaymentIntent → convert input: deposit amounts must be reconstructible for booking.stripe.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  buildConvertHoldInputFromSucceededPaymentIntent,
  resolveUsesDepositInputFromPaymentIntent,
} from "../stripe-payment-intent-convert";
import type Stripe from "stripe";

describe("buildConvertHoldInputFromSucceededPaymentIntent (deposit)", () => {
  it("sets stripe.depositCents from PI amount and finalCents from total − deposit", () => {
    const pi = {
      id: "pi_test",
      amount: 7500,
      currency: "usd",
      metadata: { payment_stage: "deposit", totalCents: "15000" },
    } as unknown as Stripe.PaymentIntent;
    const out = buildConvertHoldInputFromSucceededPaymentIntent(pi, { pricing: { totalCents: 15000 } });
    assert.strictEqual(out.paymentStage, "deposit");
    if (out.paymentStage !== "deposit") return;
    assert.strictEqual(out.stripe.depositCents, 7500);
    assert.strictEqual(out.stripe.finalCents, 7500);
    assert.strictEqual(out.stripe.totalCents, 15000);
  });
});

describe("resolveUsesDepositInputFromPaymentIntent (missing payment_stage)", () => {
  const totalCents = 100_00;

  it("classifies as deposit when payment_stage is absent and charged amount is ~50% of authoritative total", () => {
    const depositCents = Math.round(totalCents * 0.5);
    const pi = {
      metadata: {},
      amount: depositCents,
    } as Pick<Stripe.PaymentIntent, "metadata" | "amount">;
    assert.strictEqual(
      resolveUsesDepositInputFromPaymentIntent(pi, { pricing: { totalCents }, tipCents: 0, discountCents: 0 }),
      true
    );
  });

  it("classifies PI charged at full totalCents as full payment", () => {
    const pi = {
      metadata: {},
      amount: totalCents,
    } as Pick<Stripe.PaymentIntent, "metadata" | "amount">;
    assert.strictEqual(
      resolveUsesDepositInputFromPaymentIntent(pi, { pricing: { totalCents }, tipCents: 0, discountCents: 0 }),
      false
    );
  });

  it("with no hold pricing and no totalCents metadata, defaults to full payment (avoids ratio heuristic when total equals amount)", () => {
    const pi = {
      id: "pi_degenerate",
      metadata: {},
      amount: 5000,
    } as Pick<Stripe.PaymentIntent, "metadata" | "amount"> & { id?: string };
    assert.strictEqual(resolveUsesDepositInputFromPaymentIntent(pi, null), false);
  });

  it("Checkout-originated PI with payment_stage full is full payment even when charged amount is below pre-discount total (e.g. coupon)", () => {
    const pi = {
      metadata: { payment_stage: "full", totalCents: "10000" },
      amount: 8000,
    } as Pick<Stripe.PaymentIntent, "metadata" | "amount">;
    assert.strictEqual(
      resolveUsesDepositInputFromPaymentIntent(pi, {
        pricing: { totalCents: 10000 },
        tipCents: 0,
        discountCents: 2000,
      }),
      false
    );
  });
});
