/**
 * Unit tests for experience slot ID parsing and slot time windows.
 * Core paths used by hold creation, expiry, and reminder/final-charge crons.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { parseSlotId, buildSlotId, getSlotStartEnd } from "../experience-slots";

describe("parseSlotId", () => {
  it("parses 5-part slot id (hour start, no minute)", () => {
    const r = parseSlotId("2025-02-10-13-3");
    assert.ok(r);
    assert.strictEqual(r!.dateStr, "2025-02-10");
    assert.strictEqual(r!.startHour, 13);
    assert.strictEqual(r!.startMinute, 0);
    assert.strictEqual(r!.durationHours, 3);
  });

  it("parses 6-part slot id (with minute)", () => {
    const r = parseSlotId("2025-02-10-9-30-4");
    assert.ok(r);
    assert.strictEqual(r!.dateStr, "2025-02-10");
    assert.strictEqual(r!.startHour, 9);
    assert.strictEqual(r!.startMinute, 30);
    assert.strictEqual(r!.durationHours, 4);
  });

  it("returns null for too few parts", () => {
    assert.strictEqual(parseSlotId("2025-02-10-13"), null);
    assert.strictEqual(parseSlotId("2025-02-10"), null);
  });

  it("returns null for invalid date format", () => {
    assert.strictEqual(parseSlotId("abcd-02-10-13-3"), null);
  });

  it("returns null for invalid minute (only 0 or 30 allowed)", () => {
    assert.strictEqual(parseSlotId("2025-02-10-9-15-4"), null);
  });
});

describe("buildSlotId", () => {
  it("builds 5-part id when startMinute is 0 or omitted", () => {
    assert.strictEqual(buildSlotId("2025-02-10", 13, 3), "2025-02-10-13-3");
    assert.strictEqual(buildSlotId("2025-02-10", 13, 3, 0), "2025-02-10-13-3");
  });

  it("builds 6-part id when startMinute is 30", () => {
    assert.strictEqual(buildSlotId("2025-02-10", 9, 4, 30), "2025-02-10-9-30-4");
  });
});

describe("getSlotStartEnd", () => {
  it("returns start and end in America/Chicago with correct duration", () => {
    const { start, end } = getSlotStartEnd("2025-06-15", 14, 2, 0);
    assert.ok(start instanceof Date);
    assert.ok(end instanceof Date);
    const durationMs = end.getTime() - start.getTime();
    assert.strictEqual(durationMs, 2 * 60 * 60 * 1000);
  });

  it("round-trips with parseSlotId and buildSlotId", () => {
    const slotId = "2025-03-10-10-30-3";
    const parsed = parseSlotId(slotId);
    assert.ok(parsed);
    const rebuilt = buildSlotId(parsed!.dateStr, parsed!.startHour, parsed!.durationHours, parsed!.startMinute);
    assert.strictEqual(rebuilt, slotId);
    const { start, end } = getSlotStartEnd(parsed!.dateStr, parsed!.startHour, parsed!.durationHours, parsed!.startMinute);
    assert.ok(start.getTime() < end.getTime());
  });
});
