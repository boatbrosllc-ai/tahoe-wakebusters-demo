/**
 * Unit tests for pricing helpers, including Thanksgiving holiday window edge case.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { isDefaultUSHoliday } from "../pricing";

describe("isDefaultUSHoliday", () => {
  it("classifies Thanksgiving (fourth Thursday) and following days as holiday, cap at 30", () => {
    // 2024: Nov 1 is Friday → first Thu = 7, fourth Thu = 28. Thanksgiving = Nov 28.
    assert.strictEqual(isDefaultUSHoliday("2024-11-28"), true, "Nov 28 (Thanksgiving)");
    assert.strictEqual(isDefaultUSHoliday("2024-11-29"), true, "Nov 29 (day after)");
    assert.strictEqual(isDefaultUSHoliday("2024-11-30"), true, "Nov 30 (Saturday)");
  });

  it("does not overflow into December when Thanksgiving falls late (e.g. Nov 28)", () => {
    // Upper bound is Math.min(fourthThu + 3, 30), so Nov 28–30 are holiday; Dec 1 is not from this rule
    assert.strictEqual(isDefaultUSHoliday("2024-12-01"), false);
  });
});
