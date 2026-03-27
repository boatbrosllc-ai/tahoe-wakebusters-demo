/**
 * Regression: full-payment intents use controlled methods unless env + product opt in.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import type { Experience } from "../types";
import {
  alternativePaymentMethodsEnvEnabled,
  buildBookingPaymentIntentMethodParams,
  shouldUseAutomaticPaymentMethodsForFullCharge,
} from "../payment-intent-methods";

const baseExperience = {
  slug: "test",
  title: "Test",
  subtitle: "",
  descriptionLong: "",
  heroMedia: { type: "image" as const, url: "/x.jpg" },
  gallery: [] as string[],
  location: { title: "A", addressText: "" },
  maxGuests: 6,
  petsMax: 0,
  included: [] as string[],
  whatToBring: [] as string[],
  rules: [] as string[],
  cancellationPolicy: {
    freeCancelDays: 1,
    partialRefundDaysStart: 0,
    partialRefundDaysEnd: 0,
    noRefundWithinDays: 0,
    fullText: "",
  },
  faqs: [] as { q: string; a: string }[],
  seasonal: { enabled: true },
  active: true,
} as Experience;

describe("buildBookingPaymentIntentMethodParams", () => {
  const envKey = "BOOKING_ALLOW_ALTERNATIVE_PAYMENT_METHODS";

  beforeEach(() => {
    delete process.env[envKey];
  });
  afterEach(() => {
    delete process.env[envKey];
  });

  it("shared/full path: card-only when alternative methods are not enabled", () => {
    const exp: Experience = { ...baseExperience, allowDelayedPaymentMethods: false };
    const p = buildBookingPaymentIntentMethodParams({ payFullAmount: true, experience: exp });
    assert.deepStrictEqual(p, { payment_method_types: ["card"] });
    assert.strictEqual(
      shouldUseAutomaticPaymentMethodsForFullCharge({ payFullAmount: true, experience: exp }),
      false
    );
  });

  it("charter/full path: card-only without env guard even if product allows delayed methods", () => {
    const exp: Experience = { ...baseExperience, allowDelayedPaymentMethods: true };
    const p = buildBookingPaymentIntentMethodParams({ payFullAmount: true, experience: exp });
    assert.deepStrictEqual(p, { payment_method_types: ["card"] });
    assert.strictEqual(alternativePaymentMethodsEnvEnabled(), false);
  });

  it("charter/full path: automatic methods when env and experience both allow", () => {
    process.env[envKey] = "1";
    const exp: Experience = { ...baseExperience, allowDelayedPaymentMethods: true };
    const p = buildBookingPaymentIntentMethodParams({ payFullAmount: true, experience: exp });
    assert.deepStrictEqual(p, { automatic_payment_methods: { enabled: true } });
    assert.strictEqual(
      shouldUseAutomaticPaymentMethodsForFullCharge({ payFullAmount: true, experience: exp }),
      true
    );
  });

  it("deposit path: card + off_session regardless of alternative flags", () => {
    process.env[envKey] = "1";
    const exp: Experience = { ...baseExperience, allowDelayedPaymentMethods: true };
    const p = buildBookingPaymentIntentMethodParams({ payFullAmount: false, experience: exp });
    assert.deepStrictEqual(p, {
      payment_method_types: ["card"],
      setup_future_usage: "off_session",
    });
  });

  it("full without experience doc: card-only", () => {
    process.env[envKey] = "1";
    const p = buildBookingPaymentIntentMethodParams({ payFullAmount: true, experience: null });
    assert.deepStrictEqual(p, { payment_method_types: ["card"] });
  });
});
