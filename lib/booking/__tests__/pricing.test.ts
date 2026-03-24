/**
 * Unit tests for pricing helpers, including Thanksgiving holiday window edge case and computePricing.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  isDefaultUSHoliday,
  computePricing,
  getCalendarOverridePriceCents,
  getEffectiveBoatRatePriceCents,
} from "../pricing";
import { TAX_RATE } from "../constants";
import type { ExperienceHolidayDate } from "../types";

describe("isDefaultUSHoliday", () => {
  it("classifies Thanksgiving (fourth Thursday) and following days as holiday, cap at 30", () => {
    // 2024: Nov 1 is Friday → first Thu = 7, fourth Thu = 28. Thanksgiving = Nov 28.
    assert.strictEqual(isDefaultUSHoliday("2024-11-28"), true, "Nov 28 (Thanksgiving)");
    assert.strictEqual(isDefaultUSHoliday("2024-11-29"), true, "Nov 29 (day after)");
    assert.strictEqual(isDefaultUSHoliday("2024-11-30"), true, "Nov 30 (Saturday)");
  });

  it("does not overflow into December when Thanksgiving falls late (e.g. Nov 28)", () => {
    // Upper bound is Math.min(fourthThu + 3, 30), so Nov 28–30 are holiday; Dec 1 is not from this rule
    assert.strictEqual(isDefaultUSHoliday("2024-12-01"), false);
  });

  it("2018: Thanksgiving Nov 22 — third day after (Nov 25) is holiday, Nov 26 is not", () => {
    assert.strictEqual(isDefaultUSHoliday("2018-11-22"), true, "Thanksgiving");
    assert.strictEqual(isDefaultUSHoliday("2018-11-25"), true, "Sun after (3 days after)");
    assert.strictEqual(isDefaultUSHoliday("2018-11-26"), false);
  });
});

describe("computePricing", () => {
  it("computes correct subtotal, tax, and total for a normal rate with qty 1", () => {
    const rate = { priceCents: 10000 };
    const result = computePricing({ rate, addons: [], qty: 1 });
    const expectedTax = Math.round(10000 * TAX_RATE);
    assert.strictEqual(result.subtotalCents, 10000);
    assert.strictEqual(result.taxCents, expectedTax);
    assert.strictEqual(result.totalCents, 10000 + expectedTax);
    assert.strictEqual(result.currency, "usd");
  });

  it("computes totalCents = priceCents * 4 + tax for ticketed qty 4", () => {
    const priceCents = 3500;
    const rate = { priceCents };
    const result = computePricing({ rate, addons: [], qty: 4 });
    const expectedSubtotal = priceCents * 4;
    const expectedTax = Math.round(expectedSubtotal * TAX_RATE);
    assert.strictEqual(result.subtotalCents, expectedSubtotal);
    assert.strictEqual(result.taxCents, expectedTax);
    assert.strictEqual(result.totalCents, expectedSubtotal + expectedTax);
  });

  it("when priceCents is undefined, treats as 0 and returns zero subtotal/tax/total", () => {
    const rate = { priceCents: undefined } as { priceCents?: number };
    const result = computePricing({ rate, addons: [], qty: 1 });
    assert.strictEqual(result.subtotalCents, 0);
    assert.strictEqual(result.taxCents, 0);
    assert.strictEqual(result.totalCents, 0);
  });

  it("when priceCents is 0, returns explicit zero result (documented zero-price case)", () => {
    const rate = { priceCents: 0 };
    const result = computePricing({ rate, addons: [], qty: 1 });
    assert.strictEqual(result.subtotalCents, 0);
    assert.strictEqual(result.taxCents, 0);
    assert.strictEqual(result.totalCents, 0);
  });

  it("uses Math.round on tax so fractional-cent tax matches TAX_RATE consistently", () => {
    const subtotalCents = 333;
    const rate = { priceCents: subtotalCents };
    const result = computePricing({ rate, addons: [], qty: 1 });
    const expectedTax = Math.round(subtotalCents * TAX_RATE);
    assert.strictEqual(result.taxCents, expectedTax);
    assert.strictEqual(result.totalCents, subtotalCents + expectedTax);
  });

});

describe("getCalendarOverridePriceCents", () => {
  it("returns calendarRates[dateStr] * durationHours when present", () => {
    const out = getCalendarOverridePriceCents("2026-07-04", 4, { "2026-07-04": 2500 });
    assert.strictEqual(out, 10_000);
  });

  it("returns null when date key is missing", () => {
    assert.strictEqual(getCalendarOverridePriceCents("2026-07-04", 4, { "2026-07-05": 2500 }), null);
  });
});

describe("getEffectiveBoatRatePriceCents priority", () => {
  const baseRate = {
    durationHours: 4,
    priceCents: 10_000,
    priceWeekendCents: 12_000,
    priceHolidayCents: 15_000,
  };

  it("uses calendar override over priceOverrides and holidayDates", () => {
    const d = new Date("2026-06-01T12:00:00.000Z");
    const holidayDates: ExperienceHolidayDate[] = [{ start: "2026-06-01", end: "2026-06-01", priceCents: 20_000 }];
    const out = getEffectiveBoatRatePriceCents(
      baseRate,
      d,
      holidayDates,
      [{ startDate: "2026-06-01", endDate: "2026-06-01", priceCents: 5000 }],
      { "2026-06-01": 3000 },
      [0, 6],
      [5, 0]
    );
    assert.strictEqual(out, 3000 * 4);
  });

  it("falls through to priceOverrides when calendarRates has no key for the date", () => {
    const d = new Date("2026-06-01T12:00:00.000Z");
    const out = getEffectiveBoatRatePriceCents(
      baseRate,
      d,
      undefined,
      [{ startDate: "2026-06-01", endDate: "2026-06-01", priceCents: 8888 }],
      { "2026-06-02": 3000 },
      [0, 6],
      [5, 0]
    );
    assert.strictEqual(out, 8888);
  });

  it("full chain: calendar > priceOverride > getEffectiveRatePriceCents (holiday/weekend/weekday)", () => {
    const dWeekend = new Date("2026-06-06T12:00:00.000Z"); // Saturday
    const holidayDates: ExperienceHolidayDate[] = [{ start: "2026-06-06", end: "2026-06-06", priceCents: 20_000 }];
    const withCal = getEffectiveBoatRatePriceCents(
      baseRate,
      dWeekend,
      holidayDates,
      [{ startDate: "2026-06-06", endDate: "2026-06-06", priceCents: 7000 }],
      { "2026-06-06": 4000 },
      [0, 6],
      [5, 0]
    );
    assert.strictEqual(withCal, 4000 * 4);

    const overrideBeforeHoliday = getEffectiveBoatRatePriceCents(
      baseRate,
      dWeekend,
      holidayDates,
      [{ startDate: "2026-06-06", endDate: "2026-06-06", priceCents: 7000 }],
      {},
      [0, 6],
      [5, 0]
    );
    assert.strictEqual(overrideBeforeHoliday, 7000);

    const noCalNoOverride = getEffectiveBoatRatePriceCents(baseRate, dWeekend, holidayDates, [], {}, [0, 6], [5, 0]);
    assert.strictEqual(noCalNoOverride, 20_000);

    const noHol = getEffectiveBoatRatePriceCents(baseRate, dWeekend, [], [], {}, [0, 6], [5, 0]);
    assert.strictEqual(noHol, 12_000);

    const dWeekday = new Date("2026-06-03T12:00:00.000Z");
    const weekday = getEffectiveBoatRatePriceCents(baseRate, dWeekday, [], [], {}, [0, 6], [5, 0]);
    assert.strictEqual(weekday, 10_000);
  });
});
