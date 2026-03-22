/**
 * Server-side pricing: rate + addons + tax/fees.
 * All amounts in cents.
 * Rate may be Boat Rate (basePriceCents) or Experience Rate (priceCents).
 */

import type { Rate, Addon, AddonSelection, BookingPricing, ExperienceHolidayDate, BoatPriceOverride } from "./types";
import type { ExperienceAddon } from "./types";
import { getDateStrInSlotTimezone } from "./experience-slots";
import { TAX_RATE } from "./constants";

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
export function isDateInHolidayRange(
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

/** True if date (YYYY-MM-DD) falls within any of the experience's holiday date ranges. */
export function isDateInAnyHolidayRange(iso: string, holidayDates?: ExperienceHolidayDate[]): boolean {
  if (!holidayDates?.length) return false;
  return holidayDates.some((h) => isDateInHolidayRange(iso, h.start, h.end, h.recurring));
}

const DEFAULT_WEEKEND_DAYS = [0, 6]; // Sun, Sat

/** True if date (YYYY-MM-DD) is a default US holiday: July 4, Memorial Day, Labor Day, Thanksgiving, Christmas (24–26), New Year (Dec 31 / Jan 1). */
export function isDefaultUSHoliday(iso: string): boolean {
  const parts = iso.split("-");
  if (parts.length < 3) return false;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return false;

  if (month === 7 && day === 4) return true; // July 4
  if (month === 12 && day >= 24 && day <= 26) return true; // Christmas Eve, Day, day after
  if (month === 12 && day === 31) return true; // New Year's Eve
  if (month === 1 && day === 1) return true; // New Year's Day

  // Memorial Day: last Monday of May
  const mayLast = new Date(year, 4, 31);
  while (mayLast.getDay() !== 1) mayLast.setDate(mayLast.getDate() - 1);
  if (month === 5 && day === mayLast.getDate()) return true;

  // Labor Day: first Monday of September
  const sepFirst = new Date(year, 8, 1);
  while (sepFirst.getDay() !== 1) sepFirst.setDate(sepFirst.getDate() + 1);
  if (month === 9 && day === sepFirst.getDate()) return true;

  // Thanksgiving: fourth Thursday of November; cap upper bound at 30 to avoid overflow when late in month
  const nov1 = new Date(year, 10, 1);
  const firstThu = 1 + ((4 - nov1.getDay() + 7) % 7);
  const fourthThu = firstThu + 21;
  if (month === 11 && day >= fourthThu && day <= Math.min(fourthThu + 3, 30)) return true;

  return false;
}

/**
 * Effective rate price: holidays first, then weekend day, then Fri/Sun tier, then weekday base.
 * weekendDays: day numbers (0=Sun … 6=Sat) that use weekend price (e.g. [6] = Saturday only).
 * friSunDays: day numbers that use Fri/Sun price when rate has priceFriSunCents (e.g. [0, 5] = Sun, Fri).
 * Order: holiday → weekendDays → friSunDays → priceCents (weekday).
 */
export function getEffectiveRatePriceCents(
  rate: {
    priceCents: number;
    priceWeekendCents?: number;
    priceFriSunCents?: number;
    priceHolidayCents?: number;
    durationHours?: number;
  },
  date: Date,
  holidayDates?: ExperienceHolidayDate[],
  weekendDays?: number[],
  friSunDays?: number[]
): number {
  const iso = getDateStrInSlotTimezone(date);
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
  // Default US holidays (July 4, Memorial Day, Labor Day, Thanksgiving, Christmas, New Year) use holiday price when set
  if (rate.priceHolidayCents != null && isDefaultUSHoliday(iso)) return rate.priceHolidayCents;

  const day = new Date(iso + "T12:00:00Z").getUTCDay();
  const weekend = weekendDays && weekendDays.length > 0 ? weekendDays : DEFAULT_WEEKEND_DAYS;
  if (weekend.includes(day) && rate.priceWeekendCents != null) return rate.priceWeekendCents;
  if (friSunDays?.length && friSunDays.includes(day) && rate.priceFriSunCents != null) return rate.priceFriSunCents;
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
  rate: { durationHours: number; priceCents: number; priceWeekendCents?: number; priceFriSunCents?: number; priceHolidayCents?: number },
  date: Date,
  holidayDates: ExperienceHolidayDate[] | undefined,
  priceOverrides: BoatPriceOverride[] | undefined,
  calendarRates?: Record<string, number>,
  weekendDays?: number[],
  friSunDays?: number[]
): number {
  const iso = getDateStrInSlotTimezone(date);
  const calendarPrice = getCalendarOverridePriceCents(iso, rate.durationHours, calendarRates);
  if (calendarPrice != null) return calendarPrice;
  if (Array.isArray(priceOverrides) && priceOverrides.length > 0) {
    for (const o of priceOverrides) {
      if (!isDateInRange(iso, o.startDate, o.endDate)) continue;
      if (o.durationHours != null && o.durationHours !== rate.durationHours) continue;
      return o.priceCents;
    }
  }
  return getEffectiveRatePriceCents(rate, date, holidayDates, weekendDays, friSunDays);
}

export function computePricing(params: {
  rate: Rate | RateLike;
  addons: { addon: AddonLike; qty: number }[];
  currency?: string;
  /** Ticket quantity for ticketed experiences — multiplies the base rate. Defaults to 1 (charter). */
  qty?: number;
}): BookingPricing {
  const { rate, addons, currency = "usd" } = params;
  const ticketQty = Math.max(1, Math.floor(Number(params.qty ?? 1)));
  const unitCents = "basePriceCents" in rate && rate.basePriceCents != null ? rate.basePriceCents : (rate as RateLike).priceCents ?? 0;
  if (typeof process !== "undefined" && process.env.NODE_ENV === "development" && unitCents === 0) {
    console.warn("[pricing] computePricing: unitCents resolved to 0 — check rate document (priceCents/basePriceCents) for misconfigured or missing price.", { rate: "priceCents" in rate ? { priceCents: (rate as RateLike).priceCents } : "basePriceCents" in rate ? { basePriceCents: rate.basePriceCents } : rate });
  }
  const baseCents = unitCents * ticketQty;
  let subtotalCents = baseCents;
  for (const { addon, qty } of addons) {
    const safeQty = Math.max(0, Math.floor(Number(qty)));
    subtotalCents += addon.priceCents * safeQty;
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
  addonSelections: { addonId: string; qty: number; priceCents?: number; name?: string }[],
  addonsById: Map<string, Addon | ExperienceAddon>
): { addon: AddonLike; qty: number }[] {
  return addonSelections
    .map((s) => ({ ...s, qty: Math.max(0, Math.floor(Number(s.qty))) }))
    .filter((s) => s.qty > 0)
    .map((s) => {
      if (typeof s.priceCents === "number" && Number.isFinite(s.priceCents)) {
        const synthetic: AddonLike = {
          name: (typeof s.name === "string" && s.name.trim() ? s.name.trim() : "Add-on") as string,
          priceCents: Math.max(0, Math.floor(s.priceCents)),
          type: "quantity",
          active: true,
        };
        return { addon: synthetic, qty: s.qty };
      }
      const addon = addonsById.get(s.addonId);
      if (!addon || !addon.active) return null;
      return { addon, qty: s.qty };
    })
    .filter((x): x is { addon: AddonLike; qty: number } => x != null);
}
