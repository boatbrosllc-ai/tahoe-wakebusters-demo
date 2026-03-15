/**
 * Shared calendar/date utilities for booking UI (e.g. BookingModal).
 * Kept in lib for reuse and unit testing.
 */

/** Local YYYY-MM-DD (avoids timezone skew from toISOString). */
export function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
