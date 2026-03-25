/**
 * Experience slot grid: all dates are available until booked or blocked.
 * Slot id format: YYYY-MM-DD-startHour-durationHours (e.g. 2025-02-10-13-3) for :00 starts,
 * or YYYY-MM-DD-startHour-minute-durationHours (e.g. 2025-02-10-9-30-4) for :30 starts.
 *
 * Operating hours: 7am–7pm (Austin, America/Chicago). Start times are every hour from 7am
 * unless a boat defines allowedStartTimes (e.g. wakeboard: 9, 9:30, 10, 10:30, 15, 15:30, 16).
 */

/** Business timezone for slot times (Austin). */
export const SLOT_TIMEZONE = "America/Chicago";

/** Operating window: 7am (7) to 7pm (19). Last departure at 7pm; trips may end after 7pm. */
export const OPERATING_START_HOUR = 7;
export const OPERATING_END_HOUR = 19;

/** Hourly start times from 7am through 7pm (19). Final departure at 7pm. */
export const EXPERIENCE_START_HOURS = Array.from(
  { length: OPERATING_END_HOUR - OPERATING_START_HOUR + 1 },
  (_, i) => OPERATING_START_HOUR + i
) as number[];

export type ParsedSlotId = { dateStr: string; startHour: number; startMinute: number; durationHours: number };

export function parseSlotId(slotId: string): ParsedSlotId | null {
  const parts = slotId.split("-");
  if (parts.length < 5) return null;
  const y = parts[0];
  const m = parts[1].padStart(2, "0");
  const d = parts[2].padStart(2, "0");
  const dateStr = `${y}-${m}-${d}`;
  const startHour = parseInt(parts[3], 10);
  // 5 parts: YYYY-MM-DD-H-duration → minute 0. 6 parts: YYYY-MM-DD-H-M-duration → minute M.
  const durationHours = parts.length === 5 ? parseInt(parts[4], 10) : parseInt(parts[5], 10);
  const startMinute = parts.length === 6 ? parseInt(parts[4], 10) : 0;
  if (Number.isNaN(startHour) || Number.isNaN(durationHours)) return null;
  if (parts.length === 6 && (Number.isNaN(startMinute) || (startMinute !== 0 && startMinute !== 30))) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  return { dateStr, startHour, startMinute: parts.length === 6 ? startMinute : 0, durationHours };
}

/**
 * Relaxed slotId parse: strips whitespace, zero-pads month/day, then retries parseSlotId.
 * Handles legacy formats like "2026-2-20-17-3" so admin and slots can display them.
 */
export function parseSlotIdRelaxed(slotId: string): ParsedSlotId | null {
  let parsed = parseSlotId(slotId.trim());
  if (parsed) return parsed;
  const cleaned = slotId.replace(/\s/g, "");
  if (/^\d{4}-\d{1,2}-\d{1,2}-\d{1,2}-\d{1,2}$/.test(cleaned)) {
    const parts = cleaned.split("-");
    const normalized = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}-${parts[3]}-${parts[4]}`;
    return parseSlotId(normalized);
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}-\d{1,2}-\d{1,2}-\d{1,2}$/.test(cleaned)) {
    const parts = cleaned.split("-");
    const normalized = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}-${parts[3]}-${parts[4]}-${parts[5]}`;
    return parseSlotId(normalized);
  }
  return null;
}

export function buildSlotId(dateStr: string, startHour: number, durationHours: number, startMinute?: number): string {
  if (startMinute === 30) return `${dateStr}-${startHour}-30-${durationHours}`;
  return `${dateStr}-${startHour}-${durationHours}`;
}

/**
 * Normalize to YYYY-MM-DD or null. Handles Firestore/API returning ISO strings or partial dates.
 * Used for seasonal date-range and slot date comparison.
 */
export function toDateStrOnly(v: unknown): string | null {
  if (v == null) return null;
  const s = typeof v === "string" ? v.trim() : null;
  if (!s || s.length < 10) return null;
  const sliced = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(sliced) ? sliced : null;
}

/** Seasonal config shape used by isSeasonalAllowed (from Experience.seasonal). */
export interface SeasonalConfig {
  enabled?: boolean;
  startMonth?: number;
  endMonth?: number;
  startDate?: string;
  endDate?: string;
}

/**
 * Returns true if the slot date is within the experience's seasonal window (specific dates or month range).
 * Pass slotDateStr (YYYY-MM-DD) when available so calendar date is used; otherwise slotStart is used.
 * Handles wrap-around month range (e.g. November through January: startMonth 11, endMonth 1).
 */
export function isSeasonalAllowed(
  seasonal: SeasonalConfig | undefined,
  slotStart: Date,
  slotDateStr?: string
): boolean {
  if (!seasonal?.enabled) return true;
  const startDate = toDateStrOnly(seasonal.startDate);
  const endDate = toDateStrOnly(seasonal.endDate);
  if (startDate && endDate) {
    const dateStr = slotDateStr ?? slotStart.toISOString().slice(0, 10);
    return dateStr >= startDate && dateStr <= endDate;
  }
  const startMonth = seasonal.startMonth ?? 1;
  const endMonth = seasonal.endMonth ?? 12;
  const month =
    slotDateStr && /^\d{4}-\d{2}-\d{2}$/.test(slotDateStr)
      ? parseInt(slotDateStr.slice(5, 7), 10) || slotStart.getMonth() + 1
      : slotStart.getMonth() + 1;
  if (startMonth <= endMonth) return month >= startMonth && month <= endMonth;
  return month >= startMonth || month <= endMonth; // e.g. Nov (11) to Jan (1)
}

/**
 * Returns true if the given calendar month (1-based) in the given year has at least one day
 * within the experience's seasonal window. Use for disabling month navigation and hiding
 * unavailable months. Handles wrap-around (e.g. startMonth 11, endMonth 1).
 */
export function isMonthInSeasonalRange(
  seasonal: SeasonalConfig | undefined,
  year: number,
  month1Based: number
): boolean {
  if (!seasonal?.enabled) return true;
  const startDate = toDateStrOnly(seasonal.startDate);
  const endDate = toDateStrOnly(seasonal.endDate);
  if (startDate && endDate) {
    const monthStart = `${year}-${String(month1Based).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month1Based, 0).getDate();
    const monthEnd = `${year}-${String(month1Based).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return monthEnd >= startDate && monthStart <= endDate;
  }
  const startMonth = seasonal.startMonth ?? 1;
  const endMonth = seasonal.endMonth ?? 12;
  if (startMonth <= endMonth) return month1Based >= startMonth && month1Based <= endMonth;
  return month1Based >= startMonth || month1Based <= endMonth;
}

/** Cached DST boundaries (2nd Sunday March, 1st Sunday November) keyed by year. */
const dstBoundaryCache = new Map<number, { marchDay: number; novDay: number }>();

function getDstBoundary(year: number): { marchDay: number; novDay: number } {
  const cached = dstBoundaryCache.get(year);
  if (cached) return cached;
  const marchDay = 8 + (7 - new Date(year, 2, 8).getDay()) % 7;
  const novDay = 1 + (7 - new Date(year, 10, 1).getDay()) % 7;
  const boundary = { marchDay, novDay };
  dstBoundaryCache.set(year, boundary);
  return boundary;
}

/**
 * Offset in hours for America/Chicago vs UTC on the given calendar date (DST-aware).
 * Central Standard Time = -6, Central Daylight Time = -5.
 */
function getCentralOffsetHoursForDate(dateStr: string): number {
  const [y, m, day] = dateStr.split("-").map(Number);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(day)) return -6;
  // US DST: 2nd Sunday March (2am) through 1st Sunday November (2am)
  const { marchDay: secondSundayMarch, novDay: firstSundayNov } = getDstBoundary(y);
  const onOrAfterMarchDST = m > 3 || (m === 3 && day >= secondSundayMarch);
  const beforeNovemberDSTEnd = m < 11 || (m === 11 && day < firstSundayNov);
  const inDST = onOrAfterMarchDST && beforeNovemberDSTEnd;
  return inDST ? -5 : -6;
}

/**
 * Returns start and end `Date` values (JavaScript UTC instants) for a slot whose wall-clock fields
 * (dateStr + hour/minute) are interpreted in America/Chicago. The returned `Date` objects are
 * absolute UTC times; display with `timeZone: "America/Chicago"` (or `Intl`) to show local trip time.
 * Uses `Date.UTC` composition from calendar parts + DST offset so hour overflow (e.g. late departures)
 * rolls to the correct UTC day instead of invalid strings like `T24:00:00.000Z`.
 */
export function getSlotStartEnd(dateStr: string, startHour: number, durationHours: number, startMinute: number = 0): { start: Date; end: Date } {
  const offsetHours = getCentralOffsetHoursForDate(dateStr);
  const utcHour = startHour - offsetHours;
  const [y, m, d] = dateStr.split("-").map(Number);
  const startMs = Date.UTC(y, m - 1, d, utcHour, startMinute, 0, 0);
  const start = new Date(startMs);
  const end = new Date(startMs + durationHours * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Central-timezone calendar day bounds for dateStr (YYYY-MM-DD). Matches admin block-date and slot startAt storage.
 * Use for same-day Firestore queries instead of `new Date(dateStr + "T00:00:00")` (ambiguous vs UTC servers).
 */
export function getCentralCalendarDayBounds(dateStr: string): { dayStart: Date; dayEnd: Date } {
  const { start: dayStart } = getSlotStartEnd(dateStr, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { dayStart, dayEnd };
}

/**
 * Latest start hour: 7pm (19) is the final departure time. Any duration can depart at 7pm.
 */
export function getLatestStartHourForDuration(_durationHours: number): number {
  return OPERATING_END_HOUR;
}

/**
 * Returns true if (startHour, startMinute, durationHours) is within the allowed operating
 * window and permitted start times for the boat.
 *
 * - Slot must start at or after OPERATING_START_HOUR (7am) and at or before OPERATING_END_HOUR (7pm); 7pm is the final departure.
 * - If allowedStartTimes is set (boat-specific restriction), the start time must be in that list.
 * - Otherwise, only whole-hour starts (startMinute === 0) are permitted.
 */
export function isAllowedSlotTime(
  startHour: number,
  startMinute: number,
  durationHours: number,
  allowedStartTimes?: { hour: number; minute: number }[]
): boolean {
  const startDecimal = startHour + startMinute / 60;
  if (startDecimal < OPERATING_START_HOUR) return false;
  if (startDecimal > OPERATING_END_HOUR) return false;
  if (allowedStartTimes && allowedStartTimes.length > 0) {
    return allowedStartTimes.some((t) => t.hour === startHour && t.minute === startMinute);
  }
  return startMinute === 0;
}

/** True when listing boat `boatType` is the wake/wakesurf grid family (case-insensitive). */
export function isWakeListingBoatType(boatType: string | undefined): boolean {
  return typeof boatType === "string" && boatType.trim().toLowerCase() === "wake";
}

/**
 * Start-time check for wake listing boats; must match {@link getSlotGridWakeBoard} (slots API).
 * Saturday uses {@link WAKEBOARD_SATURDAY_START_TIMES} regardless of `weekdayAllowedStartTimes`.
 * Weekdays: explicit list if non-empty, else hourly :00 starts within the operating window.
 */
export function isWakeBoardListingStartTimeAllowed(
  dateStr: string,
  startHour: number,
  startMinute: number,
  weekdayAllowedStartTimes?: { hour: number; minute: number }[]
): boolean {
  const startDecimal = startHour + startMinute / 60;
  if (startDecimal < OPERATING_START_HOUR || startDecimal > OPERATING_END_HOUR) return false;
  if (isSaturdayInSlotTimezone(dateStr)) {
    return WAKEBOARD_SATURDAY_START_TIMES.some((t) => t.hour === startHour && t.minute === startMinute);
  }
  if (weekdayAllowedStartTimes && weekdayAllowedStartTimes.length > 0) {
    return weekdayAllowedStartTimes.some((t) => t.hour === startHour && t.minute === startMinute);
  }
  return startMinute === 0;
}

/** Charter listing-boat path: wake boats use the same grid rules as GET /api/booking/slots; others use {@link isAllowedSlotTime}. */
export function isListingBoatCharterStartTimeAllowed(
  boat: { boatType?: string; allowedStartTimes?: { hour: number; minute: number }[] },
  dateStr: string,
  startHour: number,
  startMinute: number,
  durationHours: number
): boolean {
  if (isWakeListingBoatType(boat.boatType)) {
    return isWakeBoardListingStartTimeAllowed(dateStr, startHour, startMinute, boat.allowedStartTimes);
  }
  return isAllowedSlotTime(startHour, startMinute, durationHours, boat.allowedStartTimes);
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

export type SlotGridItem = { dateStr: string; startHour: number; startMinute: number; durationHours: number };

/** Generate (dateStr, startHour, startMinute, durationHours) for the given range; excludes past times only for today.
 * Default: hourly starts (startMinute 0). */
export function getSlotGrid(
  startDate: Date,
  endDate: Date,
  durationHoursList: number[]
): SlotGridItem[] {
  const out: SlotGridItem[] = [];
  const now = new Date();
  const todayStr = getTodayDateStr(now);
  const startStr = getDateStrInSlotTimezone(startDate);
  const endStr = getDateStrInSlotTimezone(endDate);
  for (let dateStr = startStr; dateStr <= endStr; dateStr = nextDateStr(dateStr)) {
    for (const durationHours of durationHoursList) {
      const latestStart = getLatestStartHourForDuration(durationHours);
      for (let startHour = OPERATING_START_HOUR; startHour <= latestStart; startHour++) {
        if (dateStr === todayStr) {
          const { start: slotStart } = getSlotStartEnd(dateStr, startHour, durationHours, 0);
          if (slotStart < now) continue;
        }
        out.push({ dateStr, startHour, startMinute: 0, durationHours });
      }
    }
  }
  return out;
}

/** Allowed start times for wakeboard boat on Saturday only: 9, 9:30, 10, 10:30, 3pm, 3:30pm, 4pm (America/Chicago). */
export const WAKEBOARD_SATURDAY_START_TIMES: { hour: number; minute: number }[] = [
  { hour: 9, minute: 0 },
  { hour: 9, minute: 30 },
  { hour: 10, minute: 0 },
  { hour: 10, minute: 30 },
  { hour: 15, minute: 0 },
  { hour: 15, minute: 30 },
  { hour: 16, minute: 0 },
];

/** True if dateStr (YYYY-MM-DD) is a Saturday in America/Chicago. */
export function isSaturdayInSlotTimezone(dateStr: string): boolean {
  const offsetHours = getCentralOffsetHoursForDate(dateStr);
  const utcHour = 12 - offsetHours;
  const iso = dateStr + "T" + String(utcHour).padStart(2, "0") + ":00:00.000Z";
  const d = new Date(iso);
  return d.getUTCDay() === 6;
}

/**
 * Generate slot grid only at the given start times (e.g. wakeboard: 9, 9:30, 10, 10:30, 3pm, 3:30pm, 4pm).
 * Use for boats with restricted start times every day; excludes past times for today.
 */
export function getSlotGridForStartTimes(
  startDate: Date,
  endDate: Date,
  durationHoursList: number[],
  allowedStartTimes: { hour: number; minute: number }[]
): SlotGridItem[] {
  const out: SlotGridItem[] = [];
  const now = new Date();
  const todayStr = getTodayDateStr(now);
  const startStr = getDateStrInSlotTimezone(startDate);
  const endStr = getDateStrInSlotTimezone(endDate);
  for (let dateStr = startStr; dateStr <= endStr; dateStr = nextDateStr(dateStr)) {
    for (const durationHours of durationHoursList) {
      for (const { hour: startHour, minute: startMinute } of allowedStartTimes) {
        const startDecimal = startHour + startMinute / 60;
        if (startDecimal > OPERATING_END_HOUR) continue;
        if (dateStr === todayStr) {
          const { start: slotStart } = getSlotStartEnd(dateStr, startHour, durationHours, startMinute);
          if (slotStart < now) continue;
        }
        out.push({ dateStr, startHour, startMinute, durationHours });
      }
    }
  }
  return out;
}

/**
 * For boats that have Saturday-only restricted times (e.g. wakesurf): use saturdayStartTimes on Saturdays,
 * and the default hourly grid on all other days. Other boats unaffected.
 */
export function getSlotGridWithSaturdayOnlyRestriction(
  startDate: Date,
  endDate: Date,
  durationHoursList: number[],
  saturdayStartTimes: { hour: number; minute: number }[]
): SlotGridItem[] {
  const out: SlotGridItem[] = [];
  const now = new Date();
  const todayStr = getTodayDateStr(now);
  const startStr = getDateStrInSlotTimezone(startDate);
  const endStr = getDateStrInSlotTimezone(endDate);
  for (let dateStr = startStr; dateStr <= endStr; dateStr = nextDateStr(dateStr)) {
    const isSaturday = isSaturdayInSlotTimezone(dateStr);
    if (isSaturday) {
      for (const durationHours of durationHoursList) {
        for (const { hour: startHour, minute: startMinute } of saturdayStartTimes) {
          const startDecimal = startHour + startMinute / 60;
          if (startDecimal > OPERATING_END_HOUR) continue;
          if (dateStr === todayStr) {
            const { start: slotStart } = getSlotStartEnd(dateStr, startHour, durationHours, startMinute);
            if (slotStart < now) continue;
          }
          out.push({ dateStr, startHour, startMinute, durationHours });
        }
      }
    } else {
      for (const durationHours of durationHoursList) {
        const latestStart = getLatestStartHourForDuration(durationHours);
        for (let startHour = OPERATING_START_HOUR; startHour <= latestStart; startHour++) {
          if (dateStr === todayStr) {
            const { start: slotStart } = getSlotStartEnd(dateStr, startHour, durationHours, 0);
            if (slotStart < now) continue;
          }
          out.push({ dateStr, startHour, startMinute: 0, durationHours });
        }
      }
    }
  }
  return out;
}

/**
 * Generate one slot per calendar date for ticketed experiences with a fixed departure time.
 * Skips today's slot if the departure has already passed (DST-aware via getSlotStartEnd).
 */
export function getTicketedSlotGrid(
  startDate: Date,
  endDate: Date,
  durationHours: number,
  departureHour: number,
  departureMinute: number = 0
): SlotGridItem[] {
  const out: SlotGridItem[] = [];
  const now = new Date();
  const todayStr = getTodayDateStr(now);
  const startStr = getDateStrInSlotTimezone(startDate);
  const endStr = getDateStrInSlotTimezone(endDate);
  for (let dateStr = startStr; dateStr <= endStr; dateStr = nextDateStr(dateStr)) {
    const { start: slotStart } = getSlotStartEnd(dateStr, departureHour, durationHours, departureMinute);
    if (dateStr === todayStr && slotStart < now) continue;
    out.push({ dateStr, startHour: departureHour, startMinute: departureMinute, durationHours });
  }
  return out;
}

/**
 * Wake board boats: on Saturday use full Saturday times (9, 9:30, 10, 10:30, 3pm, 3:30pm, 4pm);
 * on other days use weekdayStartTimes if provided (e.g. 9, 9:30, 10, 10:30), otherwise hourly.
 */
export function getSlotGridWakeBoard(
  startDate: Date,
  endDate: Date,
  durationHoursList: number[],
  weekdayStartTimes?: { hour: number; minute: number }[]
): SlotGridItem[] {
  const out: SlotGridItem[] = [];
  const now = new Date();
  const todayStr = getTodayDateStr(now);
  const startStr = getDateStrInSlotTimezone(startDate);
  const endStr = getDateStrInSlotTimezone(endDate);
  for (let dateStr = startStr; dateStr <= endStr; dateStr = nextDateStr(dateStr)) {
    const isSaturday = isSaturdayInSlotTimezone(dateStr);
    if (isSaturday) {
      for (const durationHours of durationHoursList) {
        for (const { hour: startHour, minute: startMinute } of WAKEBOARD_SATURDAY_START_TIMES) {
          const startDecimal = startHour + startMinute / 60;
          if (startDecimal > OPERATING_END_HOUR) continue;
          if (dateStr === todayStr) {
            const { start: slotStart } = getSlotStartEnd(dateStr, startHour, durationHours, startMinute);
            if (slotStart < now) continue;
          }
          out.push({ dateStr, startHour, startMinute, durationHours });
        }
      }
    } else if (weekdayStartTimes?.length) {
      for (const durationHours of durationHoursList) {
        for (const { hour: startHour, minute: startMinute } of weekdayStartTimes) {
          const startDecimal = startHour + startMinute / 60;
          if (startDecimal > OPERATING_END_HOUR) continue;
          if (dateStr === todayStr) {
            const { start: slotStart } = getSlotStartEnd(dateStr, startHour, durationHours, startMinute);
            if (slotStart < now) continue;
          }
          out.push({ dateStr, startHour, startMinute, durationHours });
        }
      }
    } else {
      for (const durationHours of durationHoursList) {
        const latestStart = getLatestStartHourForDuration(durationHours);
        for (let startHour = OPERATING_START_HOUR; startHour <= latestStart; startHour++) {
          if (dateStr === todayStr) {
            const { start: slotStart } = getSlotStartEnd(dateStr, startHour, durationHours, 0);
            if (slotStart < now) continue;
          }
          out.push({ dateStr, startHour, startMinute: 0, durationHours });
        }
      }
    }
  }
  return out;
}
