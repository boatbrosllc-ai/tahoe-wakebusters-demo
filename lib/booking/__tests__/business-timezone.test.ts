/**
 * Business timezone contracts for slots, overlap, finalChargeAt,
 * pricing/holiday date-only lookups, and display date strings.
 */
import assert from "node:assert";
import { describe, it } from "node:test";
import { formatInTimeZone } from "date-fns-tz";
import { BUSINESS_TIMEZONE } from "../business-timezone";
import { SLOT_TIMEZONE, getSlotStartEnd, getCentralCalendarDayBounds, getDateStrInSlotTimezone } from "../experience-slots";
import { computeFinalChargeAtUtc } from "../final-charge-at";
import { isoToBusinessDateStr, formatBookingTimeFromIso } from "../format-booking-datetime";
import { blockIntervalsOverlapMs } from "../blocks-overlap-queries";
import { isDateInAnyHolidayRange, getEffectiveRatePriceCents, getCalendarOverridePriceCents } from "../pricing";
import { in24hWindow, inDayOfWindow } from "../reminder-eligibility";
import { brand } from "@/content/brand";

function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

describe("BUSINESS_TIMEZONE source of truth", () => {
  it("matches brand.timezone and SLOT_TIMEZONE", () => {
    assert.strictEqual(BUSINESS_TIMEZONE, brand.timezone);
    assert.strictEqual(SLOT_TIMEZONE, BUSINESS_TIMEZONE);
  });
});

describe("half-day / full-day slot creation", () => {
  it("creates Half Day 6:00–11:00 in business timezone", () => {
    const { start, end } = getSlotStartEnd("2026-06-10", 6, 5, 0);
    assert.strictEqual(formatInTimeZone(start, BUSINESS_TIMEZONE, "yyyy-MM-dd HH:mm"), "2026-06-10 06:00");
    assert.strictEqual(formatInTimeZone(end, BUSINESS_TIMEZONE, "yyyy-MM-dd HH:mm"), "2026-06-10 11:00");
    assert.strictEqual(getDateStrInSlotTimezone(start), "2026-06-10");
  });

  it("creates Full Day 6:00–14:00 in business timezone", () => {
    const { start, end } = getSlotStartEnd("2026-06-10", 6, 8, 0);
    assert.strictEqual(formatInTimeZone(start, BUSINESS_TIMEZONE, "yyyy-MM-dd HH:mm"), "2026-06-10 06:00");
    assert.strictEqual(formatInTimeZone(end, BUSINESS_TIMEZONE, "yyyy-MM-dd HH:mm"), "2026-06-10 14:00");
  });
});

describe("same-boat overlap", () => {
  it("Half Day and Full Day starting together conflict", () => {
    const half = getSlotStartEnd("2026-06-10", 6, 5, 0);
    const full = getSlotStartEnd("2026-06-10", 6, 8, 0);
    assert.strictEqual(intervalsOverlap(half.start, half.end, full.start, full.end), true);
  });

  it("two non-overlapping half days are allowed", () => {
    const morning = getSlotStartEnd("2026-06-10", 6, 5, 0);
    const afternoon = getSlotStartEnd("2026-06-10", 12, 5, 30);
    assert.strictEqual(intervalsOverlap(morning.start, morning.end, afternoon.start, afternoon.end), false);
  });

  it("block overlapping morning half day is detected", () => {
    const half = getSlotStartEnd("2026-06-10", 6, 5, 0);
    const blockStart = getSlotStartEnd("2026-06-10", 8, 1, 0).start.getTime();
    const blockEnd = getSlotStartEnd("2026-06-10", 9, 1, 0).start.getTime();
    assert.strictEqual(
      blockIntervalsOverlapMs(half.start.getTime(), half.end.getTime(), blockStart, blockEnd),
      true
    );
  });
});

describe("finalChargeAt + reminder windows", () => {
  it("finalChargeAt is 48 business-timezone hours before departure", () => {
    const { start } = getSlotStartEnd("2026-06-10", 6, 5, 0);
    const finalAt = computeFinalChargeAtUtc(start);
    assert.strictEqual(formatInTimeZone(start, BUSINESS_TIMEZONE, "yyyy-MM-dd HH:mm"), "2026-06-10 06:00");
    assert.strictEqual(formatInTimeZone(finalAt, BUSINESS_TIMEZONE, "yyyy-MM-dd HH:mm"), "2026-06-08 06:00");
    assert.strictEqual((start.getTime() - finalAt.getTime()) / 3600000, 48);
  });

  it("24h reminder window aligns to absolute trip start instant", () => {
    const { start } = getSlotStartEnd("2026-06-10", 6, 5, 0);
    const tripMs = start.getTime();
    const twentyFourHoursBefore = tripMs - 24 * 3600 * 1000;
    assert.strictEqual(in24hWindow(tripMs, twentyFourHoursBefore), true);
    assert.strictEqual(in24hWindow(tripMs, twentyFourHoursBefore - 3 * 3600 * 1000), false);
  });

  it("day-of (3h) reminder window uses trip start instant", () => {
    const { start } = getSlotStartEnd("2026-06-10", 6, 5, 0);
    const tripMs = start.getTime();
    assert.strictEqual(inDayOfWindow(tripMs, tripMs - 3 * 3600 * 1000), true);
  });
});

describe("date-only pricing / holiday lookups", () => {
  it("pricing calendar YYYY-MM-DD lookup does not shift on UTC midnight", () => {
    const date = "2026-06-10";
    const calendarRates = { "2026-06-10": 25000 };
    assert.strictEqual(getCalendarOverridePriceCents(date, 5, calendarRates), 125000);
    // 03:59 UTC on June 10 is still June 9 in America/New_York (EDT).
    const eveningPriorUtc = new Date("2026-06-10T03:59:00.000Z");
    const priorDate = getDateStrInSlotTimezone(eveningPriorUtc);
    assert.notStrictEqual(priorDate, date);
  });

  it("holidayDates match YYYY-MM-DD strings without Date parsing", () => {
    assert.strictEqual(
      isDateInAnyHolidayRange("2026-12-25", [{ start: "2026-12-24", end: "2026-12-26" }]),
      true
    );
    assert.strictEqual(
      isDateInAnyHolidayRange("2026-12-23", [{ start: "2026-12-24", end: "2026-12-26" }]),
      false
    );
    const rate = { priceCents: 100000, priceHolidayCents: 150000 };
    const noonUtc = new Date("2026-06-10T19:00:00.000Z");
    assert.strictEqual(
      getEffectiveRatePriceCents(rate, noonUtc, [{ start: "2026-06-10", end: "2026-06-10" }]),
      150000
    );
  });
});

describe("calendar boundaries", () => {
  it("near midnight keeps business calendar date", () => {
    const justBefore = getSlotStartEnd("2026-06-10", 23, 1, 0).start;
    const justAfter = getSlotStartEnd("2026-06-11", 0, 1, 30).start;
    assert.strictEqual(getDateStrInSlotTimezone(justBefore), "2026-06-10");
    assert.strictEqual(getDateStrInSlotTimezone(justAfter), "2026-06-11");
  });

  it("month boundary: last day of month slot stays on that date", () => {
    const { start } = getSlotStartEnd("2026-06-30", 6, 5, 0);
    assert.strictEqual(getDateStrInSlotTimezone(start), "2026-06-30");
    assert.strictEqual(isoToBusinessDateStr(start.toISOString()), "2026-06-30");
  });

  it("year boundary: Dec 31 / Jan 1", () => {
    const nye = getSlotStartEnd("2026-12-31", 18, 2, 0);
    assert.strictEqual(getDateStrInSlotTimezone(nye.start), "2026-12-31");
    const { dayStart, dayEnd } = getCentralCalendarDayBounds("2027-01-01");
    assert.strictEqual(getDateStrInSlotTimezone(dayStart), "2027-01-01");
    assert.strictEqual(getDateStrInSlotTimezone(dayEnd), "2027-01-01");
  });
});

describe("historical booking display fallback", () => {
  it("formats stored UTC instants in BUSINESS_TIMEZONE without rewriting storage", () => {
    const { start } = getSlotStartEnd("2026-03-09", 10, 2, 0);
    const iso = start.toISOString();
    assert.strictEqual(formatBookingTimeFromIso(iso), "10:00 AM");
    assert.strictEqual(isoToBusinessDateStr(iso), "2026-03-09");
  });
});
