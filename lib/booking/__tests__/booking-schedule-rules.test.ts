import { describe, it } from "node:test";
import assert from "node:assert";
import {
  filterSlotGridBySchedule,
  intervalsConflictWithTurnaround,
  isSlotStartWithinMinimumNotice,
  isStartTimeAllowedForDate,
  validateSlotSchedule,
} from "../booking-schedule-rules";
import { getMinimumNoticeHours, getOperatingEndHour, getOperatingStartHour } from "../customer-operations";

describe("booking-schedule-rules", () => {
  it("rejects slot starts inside minimum notice window", () => {
    const noticeHours = getMinimumNoticeHours();
    const now = Date.now();
    const tooSoon = now + (noticeHours - 1) * 60 * 60 * 1000;
    const ok = now + (noticeHours + 2) * 60 * 60 * 1000;
    assert.strictEqual(isSlotStartWithinMinimumNotice(tooSoon, now), false);
    assert.strictEqual(isSlotStartWithinMinimumNotice(ok, now), true);
  });

  it("respects default operating hour bounds when no weekly schedule is set", () => {
    const start = getOperatingStartHour();
    const end = getOperatingEndHour();
    assert.strictEqual(isStartTimeAllowedForDate("2030-06-04", start, 0, 2), true);
    assert.strictEqual(isStartTimeAllowedForDate("2030-06-04", end, 0, 1), false);
  });

  it("filters slot grid items in the past or inside notice", () => {
    const noticeHours = getMinimumNoticeHours();
    const now = new Date();
    const farDate = new Date(now.getTime() + (noticeHours + 72) * 60 * 60 * 1000);
    const dateStr = farDate.toISOString().slice(0, 10);
    const startHour = Math.min(getOperatingStartHour() + 1, getOperatingEndHour() - 3);
    const grid = [
      { dateStr, startHour, startMinute: 0, durationHours: 2 },
      { dateStr: "2020-01-01", startHour: 10, startMinute: 0, durationHours: 2 },
    ];
    const filtered = filterSlotGridBySchedule(grid, now);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0]?.dateStr, dateStr);
  });

  it("adds turnaround buffer between intervals when bufferMs is provided", () => {
    const aStart = Date.parse("2030-06-01T10:00:00.000Z");
    const aEnd = Date.parse("2030-06-01T14:00:00.000Z");
    const bStart = Date.parse("2030-06-01T14:30:00.000Z");
    const bEnd = Date.parse("2030-06-01T18:00:00.000Z");
    assert.strictEqual(intervalsConflictWithTurnaround(aStart, aEnd, bStart, bEnd, 60 * 60 * 1000), true);
    assert.strictEqual(intervalsConflictWithTurnaround(aStart, aEnd, bStart, bEnd, 0), false);
  });

  it("validateSlotSchedule returns structured reject reasons", () => {
    const noticeHours = getMinimumNoticeHours();
    const now = Date.now();
    const slotStartMs = now + (noticeHours + 24) * 60 * 60 * 1000;
    const dateStr = new Date(slotStartMs).toISOString().slice(0, 10);
    const startHour = getOperatingStartHour() + 1;
    assert.deepStrictEqual(
      validateSlotSchedule(dateStr, startHour, 0, 2, slotStartMs, now),
      { ok: true },
    );
    assert.deepStrictEqual(
      validateSlotSchedule(dateStr, getOperatingEndHour(), 0, 2, slotStartMs, now),
      { ok: false, reason: "hours" },
    );
  });
});
