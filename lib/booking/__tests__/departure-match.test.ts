import assert from "node:assert";
import { describe, it } from "node:test";
import { departureTimesMatch } from "../departure-match";
import { buildSlotId } from "../experience-slots";

describe("departureTimesMatch", () => {
  const dep = { dateStr: "2030-01-01", startHour: 10, durationHours: 3, startMinute: 0 as number | undefined };

  it("matches canonical slot ids", () => {
    assert.strictEqual(departureTimesMatch("2030-01-01-10-3", dep), true);
    const dep1030 = { dateStr: "2030-01-01", startHour: 10, durationHours: 3, startMinute: 30 };
    assert.strictEqual(departureTimesMatch(buildSlotId("2030-01-01", 10, 3, 30), dep1030), true);
  });

  it("rejects different departures", () => {
    assert.strictEqual(departureTimesMatch("2030-01-02-10-3", dep), false);
    assert.strictEqual(departureTimesMatch("2030-01-01-11-3", dep), false);
  });
});
