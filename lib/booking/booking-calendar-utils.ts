/**
 * Shared calendar/date utilities for booking UI (e.g. BookingModal).
 * Kept in lib for reuse and unit testing.
 */

import { getDateStrInSlotTimezone, parseSlotIdRelaxed } from "@/lib/booking/experience-slots";

/** Calendar date (YYYY-MM-DD) for `d` in the business timezone (America/Chicago), not the browser's local zone. */
export function toLocalDateStr(d: Date): string {
  return getDateStrInSlotTimezone(d);
}

/** Day key YYYY-MM-DD from (year, month 1-based, day). Deterministic, no Date keys. */
export function toDayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Sort key: minutes since Chicago midnight for this instant (0 = midnight Central, stable for any client TZ).
 * Prefer over local Date#getHours when ordering slot rows.
 */
export function timeOfDayMinutes(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return hour * 60 + minute;
}

/**
 * Chicago-local start time in minutes from slotId (hour*60+minute). Use with timeOfDayMinutes(startAt) as fallback.
 */
export function slotIdStartMinutesChicago(slotId: string): number | null {
  const p = parseSlotIdRelaxed(slotId);
  if (!p) return null;
  return p.startHour * 60 + (p.startMinute ?? 0);
}

/** Stable morning→night sort: prefer parsed slot id; fall back to Central wall time from ISO. */
export function slotTimeSortKey(iso: string, slotId: string): number {
  return slotIdStartMinutesChicago(slotId) ?? timeOfDayMinutes(iso);
}
