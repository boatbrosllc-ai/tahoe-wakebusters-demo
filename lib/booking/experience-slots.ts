/**
 * Experience slot grid: all dates are available until booked or blocked.
 * Slot id format: YYYY-MM-DD-startHour-durationHours (e.g. 2025-02-10-13-3).
 *
 * Operating hours: 7am–7pm (Austin, America/Chicago). Start times are every hour from 7am
 * up to the latest start that still finishes by 7pm (e.g. 8hr charter can only start by 11am).
 * Slot hours are always interpreted in America/Chicago so they display correctly everywhere.
 */

/** Business timezone for slot times (Austin). */
export const SLOT_TIMEZONE = "America/Chicago";

/** Operating window: 7am (7) to 7pm (19). End is exclusive (trip must end by 7pm). */
export const OPERATING_START_HOUR = 7;
export const OPERATING_END_HOUR = 19;

/** Hourly start times from 7am through 6pm (18) so trips end by 7pm. Use with end-time filter per duration. */
export const EXPERIENCE_START_HOURS = Array.from(
  { length: OPERATING_END_HOUR - OPERATING_START_HOUR },
  (_, i) => OPERATING_START_HOUR + i
) as number[];

export function parseSlotId(slotId: string): { dateStr: string; startHour: number; durationHours: number } | null {
  const parts = slotId.split("-");
  if (parts.length < 5) return null;
  const y = parts[0];
  const m = parts[1].padStart(2, "0");
  const d = parts[2].padStart(2, "0");
  const dateStr = `${y}-${m}-${d}`;
  const startHour = parseInt(parts[3], 10);
  const durationHours = parseInt(parts[4], 10);
  if (Number.isNaN(startHour) || Number.isNaN(durationHours)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  return { dateStr, startHour, durationHours };
}

export function buildSlotId(dateStr: string, startHour: number, durationHours: number): string {
  return `${dateStr}-${startHour}-${durationHours}`;
}

/**
 * Offset in hours for America/Chicago vs UTC on the given calendar date (DST-aware).
 * Central Standard Time = -6, Central Daylight Time = -5.
 */
function getCentralOffsetHoursForDate(dateStr: string): number {
  const [y, m, day] = dateStr.split("-").map(Number);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(day)) return -6;
  // US DST: 2nd Sunday March (2am) through 1st Sunday November (2am)
  const secondSundayMarch = 8 + (7 - new Date(y, 2, 8).getDay()) % 7;
  const firstSundayNov = 1 + (7 - new Date(y, 10, 1).getDay()) % 7;
  const onOrAfterMarchDST = m > 3 || (m === 3 && day >= secondSundayMarch);
  const beforeNovemberDSTEnd = m < 11 || (m === 11 && day < firstSundayNov);
  const inDST = onOrAfterMarchDST && beforeNovemberDSTEnd;
  return inDST ? -5 : -6;
}

/**
 * Returns start and end Date for a slot. Hours are interpreted in America/Chicago
 * so that 7 = 7am Central (not server/UTC), fixing display as 1am in Central when server is UTC.
 */
export function getSlotStartEnd(dateStr: string, startHour: number, durationHours: number): { start: Date; end: Date } {
  const offsetHours = getCentralOffsetHoursForDate(dateStr);
  const utcHour = startHour - offsetHours;
  const utcDate = new Date(dateStr + "T" + String(utcHour).padStart(2, "0") + ":00:00.000Z");
  const start = new Date(utcDate.getTime());
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Latest start hour for a given duration so the charter ends by OPERATING_END_HOUR (7pm).
 * E.g. 8hr → start by 11 (11am); 3hr → start by 16 (4pm); 1hr → start by 18 (6pm).
 */
export function getLatestStartHourForDuration(durationHours: number): number {
  return Math.max(OPERATING_START_HOUR, OPERATING_END_HOUR - durationHours);
}

/**
 * Date string (YYYY-MM-DD) for a given moment in America/Chicago. Use for "today" and date ranges so
 * dashboard "next 7 days" and slot logic match the business timezone.
 */
export function getDateStrInSlotTimezone(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SLOT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Today's date string in America/Chicago so we only filter "past" times when the slot is actually today in Austin.
 */
function getTodayDateStr(now: Date): string {
  return getDateStrInSlotTimezone(now);
}

/** Next calendar day (YYYY-MM-DD); timezone-agnostic so DST-safe for range iteration. */
function nextDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(y, m - 1, d + 1);
  const ny = next.getFullYear();
  const nm = String(next.getMonth() + 1).padStart(2, "0");
  const nd = String(next.getDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

/** Generate (dateStr, startHour, durationHours) for the given range; excludes past times only for today.
 * Date iteration uses America/Chicago for start/end so day boundaries match the business timezone regardless of server TZ. */
export function getSlotGrid(
  startDate: Date,
  endDate: Date,
  durationHoursList: number[]
): { dateStr: string; startHour: number; durationHours: number }[] {
  const out: { dateStr: string; startHour: number; durationHours: number }[] = [];
  const now = new Date();
  const todayStr = getTodayDateStr(now);
  const startStr = getDateStrInSlotTimezone(startDate);
  const endStr = getDateStrInSlotTimezone(endDate);
  for (let dateStr = startStr; dateStr <= endStr; dateStr = nextDateStr(dateStr)) {
    for (const durationHours of durationHoursList) {
      const latestStart = getLatestStartHourForDuration(durationHours);
      for (let startHour = OPERATING_START_HOUR; startHour <= latestStart; startHour++) {
        if (dateStr === todayStr) {
          const { start: slotStart } = getSlotStartEnd(dateStr, startHour, durationHours);
          if (slotStart < now) continue;
        }
        out.push({ dateStr, startHour, durationHours });
      }
    }
  }
  return out;
}
