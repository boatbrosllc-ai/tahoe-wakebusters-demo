import { describe, it } from "node:test";
import assert from "node:assert";
import {
  DEFAULT_PLAN,
  FEATURE_KEYS,
  normalizePlan,
  resolveFeatureFlags,
  mergeFeatureOverrideSources,
  hasFeature,
  PLAN_FEATURE_DEFAULTS,
} from "@/lib/plan";

describe("plan entitlements", () => {
  it("defaults unknown plan to full (legacy repos)", () => {
    assert.strictEqual(normalizePlan(undefined), DEFAULT_PLAN);
    assert.strictEqual(normalizePlan("nope"), "full");
    assert.strictEqual(normalizePlan("lite"), "lite");
  });

  it("lite disables premium modules by default", () => {
    const flags = resolveFeatureFlags("lite");
    assert.strictEqual(flags.waivers, false);
    assert.strictEqual(flags.discounts, true);
    assert.strictEqual(flags.smsReminders, false);
    assert.strictEqual(flags.blogStudio, false);
    assert.strictEqual(flags.packages, false);
    assert.strictEqual(flags.pricingCalendar, true);
    assert.strictEqual(flags.financials, false);
    assert.strictEqual(flags.advancedRefunds, false);
    assert.strictEqual(flags.giftCards, false);
  });

  it("full enables premium modules (stubs stay off)", () => {
    const flags = resolveFeatureFlags("full");
    assert.strictEqual(flags.waivers, true);
    assert.strictEqual(flags.discounts, true);
    assert.strictEqual(flags.smsReminders, true);
    assert.strictEqual(flags.blogStudio, true);
    assert.strictEqual(flags.packages, true);
    assert.strictEqual(flags.pricingCalendar, true);
    assert.strictEqual(flags.financials, true);
    assert.strictEqual(flags.advancedRefunds, true);
    assert.strictEqual(flags.paypal, false);
    assert.strictEqual(flags.giftCards, false);
  });

  it("overrides can enable a Full add-on on Lite", () => {
    const flags = resolveFeatureFlags("lite", { smsReminders: true, waivers: true });
    assert.strictEqual(flags.smsReminders, true);
    assert.strictEqual(flags.waivers, true);
    assert.strictEqual(flags.discounts, true);
    assert.strictEqual(flags.blogStudio, false);
  });

  it("mergeFeatureOverrideSources prefers featureOverrides over legacy features", () => {
    const merged = mergeFeatureOverrideSources(
      { smsReminders: false, paypal: true },
      { smsReminders: true },
    );
    assert.strictEqual(merged.smsReminders, true);
    assert.strictEqual(merged.paypal, true);
  });

  it("hasFeature falls back to plan defaults when key missing on config", () => {
    assert.strictEqual(hasFeature("waivers", { plan: "lite", features: {} }), false);
    assert.strictEqual(hasFeature("waivers", { plan: "full", features: {} }), true);
    assert.strictEqual(
      hasFeature("waivers", { plan: "lite", features: { waivers: true } }),
      true,
    );
  });

  it("PLAN_FEATURE_DEFAULTS covers every feature key", () => {
    for (const plan of ["lite", "full"] as const) {
      for (const key of FEATURE_KEYS) {
        assert.strictEqual(typeof PLAN_FEATURE_DEFAULTS[plan][key], "boolean");
      }
    }
  });
});
