/**
 * Regression: discount validation, inclusive America/Chicago expiry, and 2-character codes.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  getDiscountExpiryInstant,
  validateAndApplyDiscount,
} from "../discount";
import { getCentralCalendarDayBounds } from "../experience-slots";
import type { Discount } from "../types";

function activePercentDiscount(overrides: Partial<Discount> = {}): Discount {
  return {
    code: "AB",
    type: "percent",
    percent: 10,
    usedCount: 0,
    active: true,
    createdAt: { seconds: 0, nanoseconds: 0 },
    ...overrides,
  };
}

describe("getDiscountExpiryInstant", () => {
  it("maps any instant on a calendar day to inclusive Central dayEnd for that day", () => {
    const dateOnly = "2026-06-15";
    const { dayEnd } = getCentralCalendarDayBounds(dateOnly);
    const midday = new Date((dayEnd.getTime() + getCentralCalendarDayBounds(dateOnly).dayStart.getTime()) / 2);
    assert.strictEqual(getDiscountExpiryInstant(midday).getTime(), dayEnd.getTime());
  });

  it("matches admin discount storage (dayEnd for YYYY-MM-DD)", () => {
    const dateOnly = "2026-12-31";
    const adminStoredEnd = getCentralCalendarDayBounds(dateOnly).dayEnd;
    const noonUtc = new Date(`${dateOnly}T18:00:00.000Z`);
    assert.strictEqual(getDiscountExpiryInstant(noonUtc).getTime(), adminStoredEnd.getTime());
  });
});

describe("validateAndApplyDiscount", () => {
  it("accepts 2-character codes when configuration is valid", () => {
    const result = validateAndApplyDiscount(activePercentDiscount({ code: "AB" }), 10_000);
    assert.strictEqual(result.valid, true);
    if (result.valid) {
      assert.strictEqual(result.discount.code, "AB");
      assert.strictEqual(result.discountCents, 1000);
    }
  });

  it("treats expiry as inclusive through end of America/Chicago calendar day", () => {
    const dateOnly = "2026-06-15";
    const { dayStart, dayEnd } = getCentralCalendarDayBounds(dateOnly);
    const discount = activePercentDiscount({
      expiresAt: { seconds: 0, nanoseconds: 0, toDate: () => dayStart },
    });

    const atStart = validateAndApplyDiscount(discount, 10_000, dayStart);
    const atEnd = validateAndApplyDiscount(discount, 10_000, dayEnd);
    const afterEnd = validateAndApplyDiscount(discount, 10_000, new Date(dayEnd.getTime() + 1));

    assert.strictEqual(atStart.valid, true);
    assert.strictEqual(atEnd.valid, true);
    assert.strictEqual(afterEnd.valid, false);
    if (!afterEnd.valid) assert.match(afterEnd.error, /expired/i);
  });

  it("rejects inactive, missing, and over-limit discounts", () => {
    assert.strictEqual(validateAndApplyDiscount(null, 5000).valid, false);
    assert.strictEqual(validateAndApplyDiscount(activePercentDiscount({ active: false }), 5000).valid, false);
    assert.strictEqual(
      validateAndApplyDiscount(activePercentDiscount({ maxRedemptions: 1, usedCount: 1 }), 5000).valid,
      false
    );
  });
});
