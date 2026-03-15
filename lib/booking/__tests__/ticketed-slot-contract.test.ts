/**
 * Contract tests: slot generation (slots API / getTicketedSlotGrid) and slot validation
 * (create-hold / validateTicketedSlotParsed) use the same departure and duration.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { getTicketedSlotGrid, parseSlotId, buildSlotId } from "../experience-slots";
import { getTicketedDepartureAndDuration, validateTicketedSlotParsed } from "../ticketed-slot-utils";
import type { ExperienceForTicketed } from "../ticketed-slot-utils";

function makeRates(durationHours: number): { id: string; data: () => { durationHours: number; active?: boolean } }[] {
  return [{ id: "rate1", data: () => ({ durationHours, active: true }) }];
}

describe("ticketed slot contract: getTicketedSlotGrid vs getTicketedDepartureAndDuration", () => {
  const start = new Date("2025-06-01T12:00:00.000Z");
  const end = new Date("2025-06-03T12:00:00.000Z");

  it("experience with explicit departureHour and tripDurationHours produces slot ID that validates", () => {
    const experience: ExperienceForTicketed = {
      id: "exp1",
      slug: "sunset",
      pricingType: "ticketed",
      departureHour: 19,
      departureMinute: 0,
      tripDurationHours: 2,
    };
    const rates = makeRates(2);
    const { deptHour, deptMinute, tripDuration } = getTicketedDepartureAndDuration(experience, rates);
    assert.strictEqual(deptHour, 19);
    assert.strictEqual(deptMinute, 0);
    assert.strictEqual(tripDuration, 2);

    const grid = getTicketedSlotGrid(start, end, tripDuration, deptHour, deptMinute);
    assert.ok(grid.length >= 1);
    const first = grid[0];
    const slotId = buildSlotId(first.dateStr, first.startHour, first.durationHours, first.startMinute);
    const parsed = parseSlotId(slotId);
    assert.ok(parsed);
    const valid = validateTicketedSlotParsed(parsed!, deptHour, deptMinute, tripDuration, 2);
    assert.strictEqual(valid, true);
    assert.strictEqual(parsed!.startHour, 19);
    assert.strictEqual(parsed!.startMinute, 0);
    assert.strictEqual(parsed!.durationHours, 2);
  });

  it("experience without departureHour uses pricingType default (19 for ticketed)", () => {
    const experience: ExperienceForTicketed = {
      id: "exp2",
      slug: "sunset-cruise-2025",
      pricingType: "ticketed",
      tripDurationHours: 3,
    };
    const rates = makeRates(3);
    const { deptHour, deptMinute, tripDuration } = getTicketedDepartureAndDuration(experience, rates);
    assert.strictEqual(deptHour, 19, "ticketed without departureHour should default to 19");
    assert.strictEqual(tripDuration, 3);

    const grid = getTicketedSlotGrid(start, end, tripDuration, deptHour, deptMinute);
    assert.ok(grid.length >= 1);
    const first = grid[0];
    const slotId = buildSlotId(first.dateStr, first.startHour, first.durationHours, first.startMinute);
    const parsed = parseSlotId(slotId);
    assert.ok(parsed);
    const valid = validateTicketedSlotParsed(parsed!, deptHour, deptMinute, tripDuration, 3);
    assert.strictEqual(valid, true);
  });

  it("experience with departureMinute 30 produces slot ID that validates", () => {
    const experience: ExperienceForTicketed = {
      id: "exp3",
      pricingType: "ticketed",
      departureHour: 10,
      departureMinute: 30,
      tripDurationHours: 4,
    };
    const rates = makeRates(4);
    const { deptHour, deptMinute, tripDuration } = getTicketedDepartureAndDuration(experience, rates);
    assert.strictEqual(deptHour, 10);
    assert.strictEqual(deptMinute, 30);
    assert.strictEqual(tripDuration, 4);

    const grid = getTicketedSlotGrid(start, end, tripDuration, deptHour, deptMinute);
    assert.ok(grid.length >= 1);
    const first = grid[0];
    const slotId = buildSlotId(first.dateStr, first.startHour, first.durationHours, first.startMinute);
    const parsed = parseSlotId(slotId);
    assert.ok(parsed);
    assert.strictEqual(parsed!.startMinute, 30);
    const valid = validateTicketedSlotParsed(parsed!, deptHour, deptMinute, tripDuration, 4);
    assert.strictEqual(valid, true);
  });

  it("custom slug with pricingType ticketed uses 19 as default hour (not slug-family)", () => {
    const experience: ExperienceForTicketed = {
      id: "exp4",
      slug: "my-custom-cruise",
      pricingType: "ticketed",
      tripDurationHours: 2,
    };
    const rates = makeRates(2);
    const { deptHour } = getTicketedDepartureAndDuration(experience, rates);
    assert.strictEqual(deptHour, 19, "pricingType ticketed should give 19 regardless of slug");
  });
});

describe("validateTicketedSlotParsed", () => {
  it("rejects when startHour does not match", () => {
    const parsed = parseSlotId("2025-06-10-19-2");
    assert.ok(parsed);
    const valid = validateTicketedSlotParsed(parsed!, 18, 0, 2, 2);
    assert.strictEqual(valid, false);
  });

  it("rejects when duration does not match (parsed duration matches neither trip nor rate)", () => {
    const parsed = parseSlotId("2025-06-10-19-2");
    assert.ok(parsed);
    const valid = validateTicketedSlotParsed(parsed!, 19, 0, 3, undefined);
    assert.strictEqual(valid, false);
  });

  it("accepts when rate duration matches even if trip duration differs (durationMatch allows rate)", () => {
    const parsed = parseSlotId("2025-06-10-19-2");
    assert.ok(parsed);
    const valid = validateTicketedSlotParsed(parsed!, 19, 0, 3, 2);
    assert.strictEqual(valid, true, "slot duration 2 matches rateDuration 2");
  });
});
