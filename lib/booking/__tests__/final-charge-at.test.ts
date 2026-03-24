/**
 * finalChargeAt: 48 America/Chicago hours before trip (DST-safe).
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { toZonedTime } from "date-fns-tz";
import { differenceInHours } from "date-fns";
import { computeFinalChargeAtUtc } from "../final-charge-at";

const CHICAGO = "America/Chicago";

describe("computeFinalChargeAtUtc", () => {
  it("Monday trip after US spring-forward: final charge is exactly 48 local hours before start", () => {
    // US DST 2026: spring forward Sunday March 8. Trip Monday March 9, 2026 10:00 CDT.
    const tripStartUtc = new Date("2026-03-09T15:00:00.000Z");
    const finalUtc = computeFinalChargeAtUtc(tripStartUtc);

    const tripChi = toZonedTime(tripStartUtc, CHICAGO);
    const finalChi = toZonedTime(finalUtc, CHICAGO);
    const hours = differenceInHours(tripChi, finalChi);
    assert.strictEqual(hours, 48);

    // 48 Chicago hours before Monday 10:00 CDT (spring-forward week): Saturday 10:00 local (CST that day).
    assert.strictEqual(finalUtc.toISOString(), "2026-03-07T15:00:00.000Z");
  });
});
