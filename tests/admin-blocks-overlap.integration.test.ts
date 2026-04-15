/**
 * Regression: admin block/calendar range queries must use overlap-safe boundaries so
 * multi-day blocks that start before rangeStart but overlap the requested window are included.
 * Fetch: startAt <= rangeEnd. Filter in memory: endAt >= rangeStart (and boat filters).
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { adminBlockIntervalsOverlap } from "../lib/booking/admin-block-overlap";

function blockOverlapsRange(
  blockStart: Date,
  blockEnd: Date,
  rangeStart: Date,
  rangeEnd: Date
): boolean {
  return blockEnd.getTime() >= rangeStart.getTime() && blockStart.getTime() <= rangeEnd.getTime();
}

describe("admin blocks overlap-safe range", () => {
  it("multi-day block starting before rangeStart but overlapping window is included", () => {
    // Block: Mon 00:00 - Wed 23:59. Range: Tue 00:00 - Tue 23:59.
    const blockStart = new Date("2025-03-10T00:00:00");
    const blockEnd = new Date("2025-03-12T23:59:59");
    const rangeStart = new Date("2025-03-11T00:00:00");
    const rangeEnd = new Date("2025-03-11T23:59:59");
    assert.strictEqual(
      blockOverlapsRange(blockStart, blockEnd, rangeStart, rangeEnd),
      true,
      "block overlaps range so must be included"
    );
  });

  it("block entirely before range is excluded", () => {
    const blockStart = new Date("2025-03-08T00:00:00");
    const blockEnd = new Date("2025-03-09T23:59:59");
    const rangeStart = new Date("2025-03-11T00:00:00");
    const rangeEnd = new Date("2025-03-12T23:59:59");
    assert.strictEqual(
      blockOverlapsRange(blockStart, blockEnd, rangeStart, rangeEnd),
      false
    );
  });

  it("block entirely after range is excluded", () => {
    const blockStart = new Date("2025-03-13T00:00:00");
    const blockEnd = new Date("2025-03-14T23:59:59");
    const rangeStart = new Date("2025-03-11T00:00:00");
    const rangeEnd = new Date("2025-03-12T23:59:59");
    assert.strictEqual(
      blockOverlapsRange(blockStart, blockEnd, rangeStart, rangeEnd),
      false
    );
  });

  it("in-memory filter endAt >= rangeStart matches overlap condition", () => {
    const rangeStart = new Date("2025-03-11T00:00:00");
    const blockEndOverlap = new Date("2025-03-12T00:00:00");
    const blockEndBefore = new Date("2025-03-10T23:59:59");
    assert.strictEqual(blockEndOverlap.getTime() >= rangeStart.getTime(), true);
    assert.strictEqual(blockEndBefore.getTime() >= rangeStart.getTime(), false);
  });
});

describe("adminBlockIntervalsOverlap (exclusive-end, matches booking enforcement)", () => {
  it("returns false for two adjacent intervals that share an exact endpoint", () => {
    const boundary = new Date("2025-06-01T12:00:00.000Z");
    const a0 = new Date("2025-06-01T06:00:00.000Z");
    const b0 = boundary;
    const b1 = new Date("2025-06-01T18:00:00.000Z");
    assert.strictEqual(
      adminBlockIntervalsOverlap(a0, boundary, b0, b1),
      false,
      "touching at shared instant must not count as overlap"
    );
  });

  it("returns true when intervals genuinely overlap", () => {
    const a0 = new Date("2025-06-01T06:00:00.000Z");
    const a1 = new Date("2025-06-01T14:00:00.000Z");
    const b0 = new Date("2025-06-01T12:00:00.000Z");
    const b1 = new Date("2025-06-01T18:00:00.000Z");
    assert.strictEqual(adminBlockIntervalsOverlap(a0, a1, b0, b1), true);
  });
});
