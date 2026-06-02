/**
 * Regression: 2-character discount code acceptance aligned with validate-discount and admin POST.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  DISCOUNT_CODE_MIN_LENGTH,
  normalizeDiscountCodeInput,
  validateAdminDiscountCodeLength,
  validateDiscountCodeLength,
} from "../discount-code-input";

describe("discount code input contract", () => {
  it("requires at least 2 characters for customer and admin flows", () => {
    assert.strictEqual(DISCOUNT_CODE_MIN_LENGTH, 2);
    assert.strictEqual(validateDiscountCodeLength("").ok, false);
    assert.strictEqual(validateDiscountCodeLength("A").ok, false);
    assert.strictEqual(validateAdminDiscountCodeLength("A").ok, false);
  });

  it("accepts 2-character codes after trim and uppercase", () => {
    assert.deepStrictEqual(validateDiscountCodeLength("ab"), { ok: true, code: "ab" });
    assert.deepStrictEqual(validateAdminDiscountCodeLength("xy"), { ok: true, code: "xy" });
    assert.strictEqual(normalizeDiscountCodeInput("  ab  "), "AB");
  });

  it("rejects single-character codes with route-aligned error messages", () => {
    const customer = validateDiscountCodeLength("Z");
    assert.strictEqual(customer.ok, false);
    if (!customer.ok) {
      assert.strictEqual(customer.error, "Discount code must be at least 2 characters");
    }
    const admin = validateAdminDiscountCodeLength("Z");
    assert.strictEqual(admin.ok, false);
    if (!admin.ok) {
      assert.strictEqual(admin.error, "Code is required (at least 2 characters)");
    }
  });
});
