/**
 * Cabo / America/Mazatlan business timezone contracts for slots, overlap, finalChargeAt,
 * pricing/holiday date-only lookups, and display date strings.
 */
import assert from "node:assert";
import { describe, it } from "node:test";
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
  it("matches brand.timezone and SLOT_TIMEZONE (America/Mazatlan)", () => {
    assert.strictEqual(brand.timezone, "America/Mazatlan");
    assert.strictEqual(BUSINESS_TIMEZONE, "America/Mazatlan");
    assert.strictEqual(SLOT_TIMEZONE, BUSINESS_TIMEZONE);
  });
});

describe("Cabo half-day / full-day slot creation", () => {
  it("creates Half Day 6:00–11:00 Mazatlan", () => {
    const { start, end } = getSlotStartEnd("2026-06-10", 6, 5, 0);
    assert.strictEqual(start.toISOString(), "2026-06-10T13:00:00.000Z");
    assert.strictEqual(end.toISOString(), "2026-06-10T18:00:00.000Z");
    assert.strictEqual(getDateStrInSlotTimezone(start), "2026-06-10");
  });

  it("creates Full Day 6:00–14:00 Mazatlan", () => {
    const { start, end } = getSlotStartEnd("2026-06-10", 6, 8, 0);
    assert.strictEqual(start.toISOString(), "2026-06-10T13:00:00.000Z");
    assert.strictEqual(end.toISOString(), "2026-06-10T21:00:00.000Z");
  });
});

describe("same-boat overlap", () => {
  it("Half Day and Full Day starting together conflict", () => {
    const half = getSlotStartEnd("2026-06-10", 6, 5, 0);
    const full = getSlotStartEnd("2026-06-10", 6, 8, 0);
    assert.strictEqual(intervalsOverlap(half.start, half.end, full.start, full.end), true);
  });

  it("two non-overlapping half days are allowed", () => {
    const morning = getSlotStartEnd("2026-06-10", 6, 5, 0); // 6:00–11:00
    const afternoon = getSlotStartEnd("2026-06-10", 12, 5, 30); // 12:30–17:30
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
  it("finalChargeAt is 48 Mazatlan hours before departure", () => {
    const { start } = getSlotStartEnd("2026-06-10", 6, 5, 0);
    const finalAt = computeFinalChargeAtUtc(start);
    assert.strictEqual(finalAt.toISOString(), "2026-06-08T13:00:00.000Z");
    // Cron discovery: due when now >= finalChargeAt
    assert.strictEqual(finalAt.getTime() <= start.getTime() - 47 * 3600 * 1000, true);
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
    // Instant that is still June 9 evening in Mazatlan must not be used as the calendar key —
    // callers must pass the trip dateStr (YYYY-MM-DD), not toISOString().slice(0,10).
    const eveningPriorUtc = new Date("2026-06-10T05:00:00.000Z"); // June 9 10pm Mazatlan
    assert.strictEqual(getDateStrInSlotTimezone(eveningPriorUtc), "2026-06-09");
    assert.notStrictEqual(getDateStrInSlotTimezone(eveningPriorUtc), date);
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
    const noonUtc = new Date("2026-06-10T19:00:00.000Z"); // noon Mazatlan
    assert.strictEqual(
      getEffectiveRatePriceCents(rate, noonUtc, [{ start: "2026-06-10", end: "2026-06-10" }]),
      150000
    );
  });
});

describe("calendar boundaries", () => {
  it("near midnight keeps Cabo calendar date", () => {
    const justBefore = new Date("2026-06-11T06:59:00.000Z"); // June 10 11:59 PM Mazatlan
    const justAfter = new Date("2026-06-11T07:01:00.000Z"); // June 11 12:01 AM Mazatlan
    assert.strictEqual(getDateStrInSlotTimezone(justBefore), "2026-06-10");
    assert.strictEqual(getDateStrInSlotTimezone(justAfter), "2026-06-11");
  });

  it("month boundary: last day of month slot stays on that date", () => {
    const { start } = getSlotStartEnd("2026-06-30", 6, 5, 0);
    assert.strictEqual(getDateStrInSlotTimezone(start), "2026-06-30");
    assert.strictEqual(isoToBusinessDateStr(start.toISOString()), "2026-06-30");
  });

  it("year boundary: Dec 31 / Jan 1 Mazatlan", () => {
    const nye = getSlotStartEnd("2026-12-31", 18, 2, 0);
    assert.strictEqual(getDateStrInSlotTimezone(nye.start), "2026-12-31");
    const { dayStart, dayEnd } = getCentralCalendarDayBounds("2027-01-01");
    assert.strictEqual(getDateStrInSlotTimezone(dayStart), "2027-01-01");
    assert.strictEqual(getDateStrInSlotTimezone(dayEnd), "2027-01-01");
  });

  it("US DST dates do not shift Mazatlan offset (UTC−7 both sides)", () => {
    const before = getSlotStartEnd("2026-03-07", 10, 2, 0).start;
    const after = getSlotStartEnd("2026-03-09", 10, 2, 0).start;
    assert.strictEqual(before.toISOString(), "2026-03-07T17:00:00.000Z");
    assert.strictEqual(after.toISOString(), "2026-03-09T17:00:00.000Z");
  });
});

describe("historical booking display fallback", () => {
  it("formats stored UTC instants in BUSINESS_TIMEZONE without rewriting storage", () => {
    // Stored absolute instant that was created under Chicago math for "10:00 CDT":
    const chicagoEraInstant = "2026-03-09T15:00:00.000Z";
    // Display in Mazatlan shows 8:00 AM — do not rewrite the timestamp; ops must treat
    // Boat Bros–era Chicago instants as historical if any were imported.
    assert.strictEqual(formatBookingTimeFromIso(chicagoEraInstant), "8:00 AM");
    assert.strictEqual(isoToBusinessDateStr(chicagoEraInstant), "2026-03-09");

    // Correct Cabo 10:00 AM Mazatlan instant displays as 10:00 AM
    const caboInstant = getSlotStartEnd("2026-03-09", 10, 2, 0).start.toISOString();
    assert.strictEqual(formatBookingTimeFromIso(caboInstant), "10:00 AM");
  });
});
