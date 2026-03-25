/**
 * Regression: charter slots merge must see long-trip bookings when deriving overlap rows (3h vs 8h tier switch).
 */
import assert from "node:assert";
import { describe, it } from "node:test";
import { parseSlotIdRelaxed, getSlotsApiRequestWindow, getSlotStartEnd } from "../experience-slots";
import { bookingIntervalMsFromSlotFields, intervalOverlapsRequestWindow } from "../booking-interval";

describe("charter booking merge — 8h interval and request window", () => {
  it("parses 8-hour slot id and interval overlaps June window whether max duration is 3h or 8h", () => {
    const id = "2026-06-15-9-8";
    const parsed = parseSlotIdRelaxed(id);
    assert.ok(parsed);
    assert.strictEqual(parsed!.durationHours, 8);
    const iv = bookingIntervalMsFromSlotFields(id, undefined);
    assert.ok(iv);
    const win3 = getSlotsApiRequestWindow("2026-06-01", "2026-06-30", 3);
    assert.strictEqual(intervalOverlapsRequestWindow(iv!.startMs, iv!.endMs, win3.windowStart, win3.windowEnd), true);
    const win8 = getSlotsApiRequestWindow("2026-06-01", "2026-06-30", 8);
    assert.strictEqual(intervalOverlapsRequestWindow(iv!.startMs, iv!.endMs, win8.windowStart, win8.windowEnd), true);
  });

  it("8h booked trip overlaps same-calendar-day 3h grid row at identical start", () => {
    const dateStr = "2026-06-15";
    const longStart = getSlotStartEnd(dateStr, 9, 8, 0).start;
    const { start: shortStart, end: shortEnd } = getSlotStartEnd(dateStr, 9, 3, 0);
    assert.strictEqual(longStart.getTime(), shortStart.getTime());
    const longEnd = new Date(longStart.getTime() + 8 * 3600000);
    assert.ok(longStart.getTime() < shortEnd.getTime());
    assert.ok(longEnd.getTime() > shortStart.getTime());
  });
});
