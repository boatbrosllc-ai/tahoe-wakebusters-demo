/**
 * Tests for shared deposit/full-payment inference (deposit-mode.ts).
 * Ensures receipt and email channels agree on mode for status-driven and amount-driven cases,
 * including mixed/legacy booking records.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { isDepositMode } from "../deposit-mode";
import type { Booking, BookingPricing } from "../types";

const defaultPricing: BookingPricing = { subtotalCents: 30000, taxCents: 2000, feesCents: 0, totalCents: 32000, currency: "usd" };

function booking(overrides: Partial<Booking> & { status: Booking["status"]; stripe?: Booking["stripe"]; pricing: BookingPricing }): Booking {
  const { pricing, status, stripe, ...rest } = overrides;
  return {
    experienceId: "exp1",
    slotId: "slot1",
    rateId: "rate1",
    addonSelections: [],
    partySize: 2,
    petsCount: 0,
    answers: {},
    customer: { name: "Test", email: "t@t.com", phone: "" },
    createdAt: { seconds: 0, nanoseconds: 0 } as any,
    ...rest,
    pricing,
    status,
    stripe: stripe ?? {},
  } as Booking;
}

describe("isDepositMode", () => {
  it("returns false when stripe.depositAmountCents is missing (legacy full-paid)", () => {
    const b = booking({
      status: "paid",
      pricing: { ...defaultPricing, totalCents: 32000 },
      stripe: { paymentIntentId: "pi_1", totalAmountCents: 32000 },
    });
    assert.strictEqual(isDepositMode(b), false);
  });

  it("returns true when status is final_due and depositAmountCents is set", () => {
    const b = booking({
      status: "final_due",
      pricing: { ...defaultPricing, totalCents: 32000 },
      stripe: {
        depositPaymentIntentId: "pi_d",
        depositAmountCents: 16000,
        finalAmountCents: 16000,
        totalAmountCents: 32000,
      },
    });
    assert.strictEqual(isDepositMode(b), true);
  });

  it("returns true when status is final_paid (amount-driven: deposit < total)", () => {
    const b = booking({
      status: "final_paid",
      pricing: { ...defaultPricing, totalCents: 32000 },
      stripe: {
        depositPaymentIntentId: "pi_d",
        depositAmountCents: 16000,
        finalAmountCents: 16000,
        totalAmountCents: 32000,
      },
    });
    assert.strictEqual(isDepositMode(b), true);
  });

  it("returns true for amount-driven when depositAmountCents < totalAmountCents (legacy/mixed record)", () => {
    const b = booking({
      status: "paid",
      pricing: { ...defaultPricing, totalCents: 32000 },
      stripe: {
        depositPaymentIntentId: "pi_d",
        depositAmountCents: 16000,
        finalAmountCents: 16000,
        totalAmountCents: 32000,
      },
    });
    assert.strictEqual(isDepositMode(b), true);
  });

  it("returns false when depositAmountCents equals totalAmountCents (full paid, split fields present)", () => {
    const b = booking({
      status: "paid",
      pricing: { ...defaultPricing, totalCents: 32000 },
      stripe: {
        paymentIntentId: "pi_1",
        depositAmountCents: 32000,
        totalAmountCents: 32000,
      },
    });
    assert.strictEqual(isDepositMode(b), false);
  });

  it("uses booking.pricing.totalCents when stripe.totalAmountCents missing", () => {
    const b = booking({
      status: "final_due",
      pricing: { ...defaultPricing, totalCents: 32000 },
      stripe: {
        depositPaymentIntentId: "pi_d",
        depositAmountCents: 16000,
        finalAmountCents: 16000,
      },
    });
    assert.strictEqual(isDepositMode(b), true);
  });

  it("returns false when status is final_due but depositAmountCents is absent (falls through; no amount evidence)", () => {
    const b = booking({
      status: "final_due",
      pricing: { ...defaultPricing, totalCents: 32000 },
      stripe: { totalAmountCents: 32000 },
    });
    assert.strictEqual(isDepositMode(b), false);
  });

  it("returns false when status is final_paid but depositAmountCents is absent", () => {
    const b = booking({
      status: "final_paid",
      pricing: { ...defaultPricing, totalCents: 32000 },
      stripe: { totalAmountCents: 32000, finalPaymentIntentId: "pi_f" },
    });
    assert.strictEqual(isDepositMode(b), false);
  });
});
