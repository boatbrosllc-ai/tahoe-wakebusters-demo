/**
 * Shared calendar/date utilities for booking UI (e.g. BookingModal).
 * Kept in lib for reuse and unit testing.
 */

import { getDateStrInSlotTimezone } from "@/lib/booking/experience-slots";

/** Calendar date (YYYY-MM-DD) for `d` in the business timezone (America/Chicago), not the browser's local zone. */
export function toLocalDateStr(d: Date): string {
  return getDateStrInSlotTimezone(d);
}

/** Day key YYYY-MM-DD from (year, month 1-based, day). Deterministic, no Date keys. */
export function toDayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Sort key: time of day in minutes (0 = midnight, 420 = 7 AM, 1080 = 6 PM). Use for morning→night order. */
export function timeOfDayMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}
