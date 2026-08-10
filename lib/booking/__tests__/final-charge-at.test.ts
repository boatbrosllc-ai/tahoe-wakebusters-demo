/**
 * finalChargeAt: 48 BUSINESS_TIMEZONE (America/Mazatlan) clock hours before trip.
 * Mazatlan does not observe DST (UTC−7 year-round).
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { formatInTimeZone } from "date-fns-tz";
import { computeFinalChargeAtUtc } from "../final-charge-at";
import { BUSINESS_TIMEZONE } from "../business-timezone";
import { getSlotStartEnd } from "../experience-slots";

describe("computeFinalChargeAtUtc", () => {
  it("is exactly 48 Mazatlan local hours before a 6:00 AM Cabo departure", () => {
    // June 10, 2026 6:00 AM America/Mazatlan → final charge June 8 6:00 AM Mazatlan
    const { start: tripStartUtc } = getSlotStartEnd("2026-06-10", 6, 5, 0);
    const finalUtc = computeFinalChargeAtUtc(tripStartUtc);

    assert.strictEqual(tripStartUtc.toISOString(), "2026-06-10T13:00:00.000Z");
    assert.strictEqual(finalUtc.toISOString(), "2026-06-08T13:00:00.000Z");
    assert.strictEqual(formatInTimeZone(tripStartUtc, BUSINESS_TIMEZONE, "yyyy-MM-dd HH:mm"), "2026-06-10 06:00");
    assert.strictEqual(formatInTimeZone(finalUtc, BUSINESS_TIMEZONE, "yyyy-MM-dd HH:mm"), "2026-06-08 06:00");
    assert.strictEqual((tripStartUtc.getTime() - finalUtc.getTime()) / 3600000, 48);
  });

  it("stays 48 local hours across US spring-forward week (Mazatlan has no DST)", () => {
    // Monday March 9, 2026 10:00 Mazatlan
    const tripStartUtc = new Date("2026-03-09T17:00:00.000Z");
    const finalUtc = computeFinalChargeAtUtc(tripStartUtc);

    assert.strictEqual(formatInTimeZone(tripStartUtc, BUSINESS_TIMEZONE, "yyyy-MM-dd HH:mm"), "2026-03-09 10:00");
    assert.strictEqual(formatInTimeZone(finalUtc, BUSINESS_TIMEZONE, "yyyy-MM-dd HH:mm"), "2026-03-07 10:00");
    assert.strictEqual(finalUtc.toISOString(), "2026-03-07T17:00:00.000Z");
    // Absolute duration is also 48h because Mazatlan has no DST.
    assert.strictEqual((tripStartUtc.getTime() - finalUtc.getTime()) / 3600000, 48);
  });
});
