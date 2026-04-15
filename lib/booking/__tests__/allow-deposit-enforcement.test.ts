/**
 * Tests for allowDeposit PATCH enforcement: when effective pricingType is
 * "ticketed", allowDeposit must be coerced to false.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { enforceAllowDeposit } from "../enforce-allow-deposit";

describe("allowDeposit PATCH enforcement", () => {
  it("ticketed stored, pricingType omitted in payload → allowDeposit coerced to false", () => {
    const parsed = { allowDeposit: true };
    const storedPricingType = "ticketed";
    const result = enforceAllowDeposit(parsed, storedPricingType);
    assert.strictEqual(result.allowDeposit, false);
  });

  it("ticketed explicit in payload → allowDeposit coerced to false", () => {
    const parsed = { pricingType: "ticketed" as const, allowDeposit: true };
    const storedPricingType = "charter";
    const result = enforceAllowDeposit(parsed, storedPricingType);
    assert.strictEqual(result.allowDeposit, false);
  });

  it("charter explicit in payload → allowDeposit remains true", () => {
    const parsed = { pricingType: "charter" as const, allowDeposit: true };
    const storedPricingType = "ticketed";
    const result = enforceAllowDeposit(parsed, storedPricingType);
    assert.strictEqual(result.allowDeposit, true);
  });

  it("charter stored, pricingType omitted in payload → allowDeposit remains true", () => {
    const parsed = { allowDeposit: true };
    const storedPricingType = "charter";
    const result = enforceAllowDeposit(parsed, storedPricingType);
    assert.strictEqual(result.allowDeposit, true);
  });

  it("ticketed stored, pricingType omitted, allowDeposit omitted in payload → allowDeposit coerced to false", () => {
    const parsed = {};
    const storedPricingType = "ticketed";
    const result = enforceAllowDeposit(parsed, storedPricingType);
    assert.strictEqual(result.allowDeposit, false);
  });
});
