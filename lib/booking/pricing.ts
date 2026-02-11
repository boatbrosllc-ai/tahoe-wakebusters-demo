/**
 * Server-side pricing: rate + addons + tax/fees.
 * All amounts in cents.
 * Rate may be Boat Rate (basePriceCents) or Experience Rate (priceCents).
 */

import type { Rate, Addon, AddonSelection, BookingPricing, ExperienceHolidayDate, BoatPriceOverride } from "./types";
import type { ExperienceAddon } from "./types";

const TAX_RATE = 0.0825; // 8.25% example; adjust per jurisdiction
const FEE_CENTS = 0; // optional booking fee

type RateLike = { basePriceCents?: number; priceCents?: number; priceWeekendCents?: number; priceHolidayCents?: number };
type AddonLike = Addon | ExperienceAddon;

/** ISO date YYYY-MM-DD for a Date (local time). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isDateInRange(date: string, start: string, end: string): boolean {
  if (!start || !end) return false;
  return date >= start && date <= end;
}

/** Month-day "MM-DD" for recurring comparison */
function toMonthDay(iso: string): string {
  return iso.slice(5, 10);
}

/** True if date (YYYY-MM-DD) falls in range, or if recurring and (month-day) falls in range every year. Empty end = single day (end = start). */
function isDateInHolidayRange(
  iso: string,
  start: string,
  end: string,
  recurring?: boolean
): boolean {
  if (!start) return false;
  const endUse = end || start;
  if (!recurring) return isDateInRange(iso, start, endUse);
  const md = toMonthDay(iso);
  const mdStart = toMonthDay(start);
  const mdEnd = toMonthDay(endUse);
  if (mdStart <= mdEnd) return md >= mdStart && md <= mdEnd;
  return md >= mdStart || md <= mdEnd;
}

const DEFAULT_WEEKEND_DAYS = [0, 6]; // Sun, Sat

/**
 * Effective rate price: rates by day type are the default; holidays and custom dates are the final override.
 * Order: if date falls in a holiday/custom range, use that range's price (or holiday default); else weekend or weekday base.
 * weekendDays: day numbers (0=Sun … 6=Sat) that use weekend price. Default [0, 6] = Sat–Sun.
 * When a holiday has priceCentsByDuration and rate has durationHours, per-duration override is used first.
 */
export function getEffectiveRatePriceCents(
  rate: { priceCents: number; priceWeekendCents?: number; priceHolidayCents?: number; durationHours?: number },
  date: Date,
  holidayDates?: ExperienceHolidayDate[],
  weekendDays?: number[]
): number {
  const iso = toISODate(date);
  if (holidayDates?.length) {
    for (const h of holidayDates) {
      if (!isDateInHolidayRange(iso, h.start, h.end, h.recurring)) continue;
      const byDur = rate.durationHours != null && h.priceCentsByDuration && h.priceCentsByDuration[rate.durationHours] != null
        ? h.priceCentsByDuration[rate.durationHours]
        : null;
      const cents = byDur ?? h.priceCents ?? rate.priceHolidayCents;
      if (cents != null) return cents;
    }
  }
  const day = date.getDay();
  const weekend = weekendDays && weekendDays.length > 0 ? weekendDays : DEFAULT_WEEKEND_DAYS;
  const isWeekend = weekend.includes(day);
  if (isWeekend && rate.priceWeekendCents != null) return rate.priceWeekendCents;
  return rate.priceCents;
}

/**
 * If the pricing calendar has an override for (boatType, date), return hourlyRateCents * durationHours.
 * Otherwise return null so caller uses boat/rate pricing.
 */
export function getCalendarOverridePriceCents(
  dateStr: string,
  durationHours: number,
  calendarRates: Record<string, number> | undefined
): number | null {
  if (!calendarRates || typeof calendarRates[dateStr] !== "number") return null;
  return calendarRates[dateStr] * durationHours;
}

/**
 * Boat rate price: calendar override (boatType+date) > boat priceOverrides > weekday/weekend/holiday.
 * Pass calendarRates when boat has boatType (fetch from pricingCalendar/{boatType}.rates).
 */
export function getEffectiveBoatRatePriceCents(
  rate: { durationHours: number; priceCents: number; priceWeekendCents?: number; priceHolidayCents?: number },
  date: Date,
  holidayDates: ExperienceHolidayDate[] | undefined,
  priceOverrides: BoatPriceOverride[] | undefined,
  calendarRates?: Record<string, number>,
  weekendDays?: number[]
): number {
  const iso = toISODate(date);
  const calendarPrice = getCalendarOverridePriceCents(iso, rate.durationHours, calendarRates);
  if (calendarPrice != null) return calendarPrice;
  if (Array.isArray(priceOverrides) && priceOverrides.length > 0) {
    for (const o of priceOverrides) {
      if (!isDateInRange(iso, o.startDate, o.endDate)) continue;
      if (o.durationHours != null && o.durationHours !== rate.durationHours) continue;
      return o.priceCents;
    }
  }
  return getEffectiveRatePriceCents(rate, date, holidayDates, weekendDays);
}

export function computePricing(params: {
  rate: Rate | RateLike;
  addons: { addon: AddonLike; qty: number }[];
  currency?: string;
}): BookingPricing {
  const { rate, addons, currency = "usd" } = params;
  const baseCents = "basePriceCents" in rate && rate.basePriceCents != null ? rate.basePriceCents : (rate as RateLike).priceCents ?? 0;
  let subtotalCents = baseCents;
  for (const { addon, qty } of addons) {
    subtotalCents += addon.priceCents * qty;
  }
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const feesCents = FEE_CENTS;
  const totalCents = subtotalCents + taxCents + feesCents;
  return {
    subtotalCents,
    taxCents,
    feesCents,
    totalCents,
    currency,
  };
}

export function buildAddonSelectionsForPricing(
  addonSelections: { addonId: string; qty: number }[],
  addonsById: Map<string, Addon | ExperienceAddon>
): { addon: AddonLike; qty: number }[] {
  return addonSelections
    .filter((s) => s.qty > 0)
    .map((s) => {
      const addon = addonsById.get(s.addonId);
      if (!addon || !addon.active) return null;
      return { addon, qty: s.qty };
    })
    .filter((x): x is { addon: AddonLike; qty: number } => x != null);
}
