/**
 * finalChargeAt: 48 BUSINESS_TIMEZONE clock hours before trip.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { formatInTimeZone } from "date-fns-tz";
import { computeFinalChargeAtUtc } from "../final-charge-at";
import { BUSINESS_TIMEZONE } from "../business-timezone";
import { getSlotStartEnd } from "../experience-slots";

describe("computeFinalChargeAtUtc", () => {
  it("is exactly 48 local hours before a 6:00 AM departure", () => {
    const { start: tripStartUtc } = getSlotStartEnd("2026-06-10", 6, 5, 0);
    const finalUtc = computeFinalChargeAtUtc(tripStartUtc);

    assert.strictEqual(formatInTimeZone(tripStartUtc, BUSINESS_TIMEZONE, "yyyy-MM-dd HH:mm"), "2026-06-10 06:00");
    assert.strictEqual(formatInTimeZone(finalUtc, BUSINESS_TIMEZONE, "yyyy-MM-dd HH:mm"), "2026-06-08 06:00");
    assert.strictEqual((tripStartUtc.getTime() - finalUtc.getTime()) / 3600000, 48);
  });

  it("stays 48 local clock hours across DST (UTC elapsed hours may differ)", () => {
    const tripStartUtc = getSlotStartEnd("2026-03-09", 10, 2, 0).start;
    const finalUtc = computeFinalChargeAtUtc(tripStartUtc);

    assert.strictEqual(formatInTimeZone(tripStartUtc, BUSINESS_TIMEZONE, "yyyy-MM-dd HH:mm"), "2026-03-09 10:00");
    assert.strictEqual(formatInTimeZone(finalUtc, BUSINESS_TIMEZONE, "yyyy-MM-dd HH:mm"), "2026-03-07 10:00");
    // Wall-clock rule is 48 local hours; spring-forward shrinks UTC elapsed time by one hour.
    assert.strictEqual((tripStartUtc.getTime() - finalUtc.getTime()) / 3600000, 47);
  });
});
