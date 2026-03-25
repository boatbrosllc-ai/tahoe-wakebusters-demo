/**
 * Booking/hold interval helpers: overlap checks and startDateStr window expansion
 * so overnight and multi-day trips are not missed when querying by calendar day.
 */

import { getDateStrInSlotTimezone, getSlotStartEnd, parseSlotIdRelaxed } from "@/lib/booking/experience-slots";

export { getSlotsApiRequestWindow } from "@/lib/booking/experience-slots";

/** Upper bound on how far we widen startDateStr queries vs max trip duration (caps scan size). */
export const BOOKING_SLOT_START_DATE_LOOKBACK_CAP_DAYS = 14;

export function bookingLookbackDaysFromMaxDuration(maxDurationHours: number): number {
  return Math.min(
    BOOKING_SLOT_START_DATE_LOOKBACK_CAP_DAYS,
    Math.max(1, Math.ceil(Math.max(1, maxDurationHours) / 24) + 1)
  );
}

/** Shift YYYY-MM-DD by whole days using the same UTC-noon anchor as booking range parsing. */
export function addCalendarDaysToDateStr(dateStr: string, deltaDays: number): string {
  const base = new Date(dateStr + "T12:00:00.000Z");
  if (Number.isNaN(base.getTime())) return dateStr;
  const shifted = new Date(base.getTime() + deltaDays * 86400000);
  return getDateStrInSlotTimezone(shifted);
}

export function intervalsOverlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/** True if [aStart, aEnd] overlaps the half-open request window [windowStart, windowEnd] from slots API (inclusive end). */
export function intervalOverlapsRequestWindow(
  aStart: number,
  aEnd: number,
  windowStart: Date,
  windowEnd: Date,
): boolean {
  return intervalsOverlapMs(aStart, aEnd, windowStart.getTime(), windowEnd.getTime());
}

export function bookingIntervalMsFromSlotFields(
  slotIdRaw: unknown,
  slot_id?: unknown,
): { startMs: number; endMs: number } | null {
  const raw = (slotIdRaw ?? slot_id) as string | undefined;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parsed = parseSlotIdRelaxed(raw.trim());
  if (!parsed) return null;
  try {
    const { start, end } = getSlotStartEnd(
      parsed.dateStr,
      parsed.startHour,
      parsed.durationHours,
      parsed.startMinute ?? 0,
    );
    const s = start.getTime();
    const e = end.getTime();
    if (Number.isNaN(s) || Number.isNaN(e)) return null;
    return { startMs: s, endMs: e };
  } catch {
    return null;
  }
}
