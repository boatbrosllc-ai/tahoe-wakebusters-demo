import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildNsfSlotId,
  isNsfFullDaySlot,
  nsfCharterSlotsConflict,
  nsfDurationHours,
  NSF_WINDOW_AM,
  NSF_WINDOW_FULL,
  NSF_WINDOW_PM,
  parseNsfWindowFromSlot,
} from "@/content/charter-windows";
import { parseSlotId } from "@/lib/booking/experience-slots";

describe("nsf charter windows", () => {
  it("builds AM / PM / full slot ids", () => {
    assert.equal(buildNsfSlotId("2026-08-15", NSF_WINDOW_AM), "2026-08-15-6-5");
    assert.equal(buildNsfSlotId("2026-08-15", NSF_WINDOW_PM), "2026-08-15-14-5");
    assert.equal(buildNsfSlotId("2026-08-15", NSF_WINDOW_FULL, 0), "2026-08-15-6-8");
    assert.equal(buildNsfSlotId("2026-08-15", NSF_WINDOW_FULL, 3), "2026-08-15-6-11");
  });

  it("allows AM + PM same day", () => {
    const am = parseSlotId(buildNsfSlotId("2026-08-15", NSF_WINDOW_AM))!;
    const pm = parseSlotId(buildNsfSlotId("2026-08-15", NSF_WINDOW_PM))!;
    assert.equal(nsfCharterSlotsConflict(am, pm), false);
  });

  it("blocks PM when base full day ends at 2:00 (adjacent clock times)", () => {
    const full = parseSlotId(buildNsfSlotId("2026-08-15", NSF_WINDOW_FULL, 0))!;
    const pm = parseSlotId(buildNsfSlotId("2026-08-15", NSF_WINDOW_PM))!;
    assert.equal(isNsfFullDaySlot(full), true);
    assert.equal(nsfCharterSlotsConflict(full, pm), true);
  });

  it("blocks AM when full day is booked", () => {
    const full = parseSlotId(buildNsfSlotId("2026-08-15", NSF_WINDOW_FULL, 0))!;
    const am = parseSlotId(buildNsfSlotId("2026-08-15", NSF_WINDOW_AM))!;
    assert.equal(nsfCharterSlotsConflict(full, am), true);
  });

  it("blocks second full day / extended full day same day", () => {
    const full = parseSlotId(buildNsfSlotId("2026-08-15", NSF_WINDOW_FULL, 0))!;
    const ext = parseSlotId(buildNsfSlotId("2026-08-15", NSF_WINDOW_FULL, 3))!;
    assert.equal(nsfCharterSlotsConflict(full, ext), true);
  });

  it("parses window ids and extension durations", () => {
    assert.equal(parseNsfWindowFromSlot(parseSlotId("2026-08-15-6-5")), "am");
    assert.equal(parseNsfWindowFromSlot(parseSlotId("2026-08-15-14-5")), "pm");
    assert.equal(parseNsfWindowFromSlot(parseSlotId("2026-08-15-6-11")), "full");
    assert.equal(nsfDurationHours(NSF_WINDOW_FULL, 2), 10);
  });
});
