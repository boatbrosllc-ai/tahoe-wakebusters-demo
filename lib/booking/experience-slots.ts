import { fromZonedTime } from "date-fns-tz";

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

/** Each hyphen-separated segment must be a plain unsigned integer (no trailing junk from parseInt). */
function isSlotIdUnsignedIntToken(s: string): boolean {
  return /^[0-9]+$/.test(s);
}

const SLOT_ID_MIN_DURATION_HOURS = 1;
/** Generous cap; multi-day trips use startDateStr scans — IDs beyond this are rejected as malformed. */
const SLOT_ID_MAX_DURATION_HOURS = 24 * 21;

export function parseSlotId(slotId: string): ParsedSlotId | null {
  const parts = slotId.split("-");
  if (parts.length !== 5 && parts.length !== 6) return null;
  const y = parts[0];
  const mo = parts[1];
  const da = parts[2];
  if (!isSlotIdUnsignedIntToken(y) || y.length !== 4) return null;
  if (!isSlotIdUnsignedIntToken(mo) || !isSlotIdUnsignedIntToken(da)) return null;
  const monthNum = Number(mo);
  const dayNum = Number(da);
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null;
  const m = mo.padStart(2, "0");
  const d = da.padStart(2, "0");
  const dateStr = `${y}-${m}-${d}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  if (!isSlotIdUnsignedIntToken(parts[3])) return null;
  const startHour = Number(parts[3]);
  if (startHour < 0 || startHour > 23) return null;
  let startMinute: number;
  let durationHours: number;
  if (parts.length === 5) {
    if (!isSlotIdUnsignedIntToken(parts[4])) return null;
    startMinute = 0;
    durationHours = Number(parts[4]);
  } else {
    if (!isSlotIdUnsignedIntToken(parts[4]) || !isSlotIdUnsignedIntToken(parts[5])) return null;
    startMinute = Number(parts[4]);
    durationHours = Number(parts[5]);
    if (startMinute !== 0 && startMinute !== 30) return null;
  }
  if (
    !Number.isFinite(durationHours) ||
    durationHours < SLOT_ID_MIN_DURATION_HOURS ||
    durationHours > SLOT_ID_MAX_DURATION_HOURS
  ) {
    return null;
  }
  return { dateStr, startHour, startMinute, durationHours };
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
    if (!isSlotIdUnsignedIntToken(parts[0]) || parts[0].length !== 4) return null;
    if (
      !isSlotIdUnsignedIntToken(parts[1]) ||
      !isSlotIdUnsignedIntToken(parts[2]) ||
      !isSlotIdUnsignedIntToken(parts[3]) ||
      !isSlotIdUnsignedIntToken(parts[4])
    ) {
      return null;
    }
    const normalized = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}-${parts[3]}-${parts[4]}`;
    return parseSlotId(normalized);
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}-\d{1,2}-\d{1,2}-\d{1,2}$/.test(cleaned)) {
    const parts = cleaned.split("-");
    if (!isSlotIdUnsignedIntToken(parts[0]) || parts[0].length !== 4) return null;
    if (
      !isSlotIdUnsignedIntToken(parts[1]) ||
      !isSlotIdUnsignedIntToken(parts[2]) ||
      !isSlotIdUnsignedIntToken(parts[3]) ||
      !isSlotIdUnsignedIntToken(parts[4]) ||
      !isSlotIdUnsignedIntToken(parts[5])
    ) {
      return null;
    }
    const normalized = `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}-${parts[3]}-${parts[4]}-${parts[5]}`;
    return parseSlotId(normalized);
  }
  return null;
}

/**
 * Slots API request window in America/Chicago: from midnight on `startDateStr` through the end instant
 * of a trip that departs at the last schedulable hour ({@link OPERATING_END_HOUR}) on `endDateStr`
 * with `maxDurationHours`. Use this for booking/hold/block overlap and slot `startAt` query upper bounds
 * so evening departures on the range end date are not cut off by a UTC end-of-day timestamp.
 */
export function getSlotsApiRequestWindow(
  startDateStr: string,
  endDateStr: string,
  maxDurationHours: number,
): { windowStart: Date; windowEnd: Date } {
  const { dayStart: windowStart } = getCentralCalendarDayBounds(startDateStr);
  const dur = Math.max(1, maxDurationHours);
  const { end: windowEnd } = getSlotStartEnd(endDateStr, OPERATING_END_HOUR, dur, 0);
  return { windowStart, windowEnd };
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
    const dateStr = slotDateStr ?? getDateStrInSlotTimezone(slotStart);
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

function formatDatePartsInChicago(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SLOT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const readPart = (type: string): number => parseInt(parts.find((p) => p.type === type)?.value ?? "", 10);
  return { year: readPart("year"), month: readPart("month"), day: readPart("day") };
}

/**
 * Build the UTC instant for midnight in America/Chicago on `dateStr`.
 * Uses date-fns-tz conversion so DST transition days map correctly.
 */
function getChicagoMidnightUtcInstant(dateStr: string): Date {
  return fromZonedTime(`${dateStr}T00:00:00`, SLOT_TIMEZONE);
}

/**
 * Returns start and end `Date` values (JavaScript UTC instants) for a slot whose wall-clock fields
 * (dateStr + hour/minute) are interpreted in America/Chicago. The returned `Date` objects are
 * absolute UTC times; display with `timeZone: "America/Chicago"` (or `Intl`) to show local trip time.
 * Uses `Date.UTC` composition from calendar parts + DST offset so hour overflow (e.g. late departures)
 * rolls to the correct UTC day instead of invalid strings like `T24:00:00.000Z`.
 */
export function getSlotStartEnd(dateStr: string, startHour: number, durationHours: number, startMinute: number = 0): { start: Date; end: Date } {
  const hh = String(startHour).padStart(2, "0");
  const mm = String(startMinute).padStart(2, "0");
  const start = fromZonedTime(`${dateStr}T${hh}:${mm}:00`, SLOT_TIMEZONE);
  const startMs = start.getTime();
  const end = new Date(startMs + durationHours * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Central-timezone calendar day bounds for dateStr (YYYY-MM-DD). Matches admin block-date and slot startAt storage.
 * Use for same-day Firestore queries instead of `new Date(dateStr + "T00:00:00")` (ambiguous vs UTC servers).
 */
export function getCentralCalendarDayBounds(dateStr: string): { dayStart: Date; dayEnd: Date } {
  const dayStart = getChicagoMidnightUtcInstant(dateStr);
  const nextNoonUtc = new Date(dayStart.getTime() + 36 * 60 * 60 * 1000);
  const nextDateStr = getDateStrInSlotTimezone(nextNoonUtc);
  const nextDayStart = getChicagoMidnightUtcInstant(nextDateStr);
  const dayEnd = new Date(nextDayStart.getTime() - 1);
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

/**
 * Client+server shared escape hatch: when set, watersports charter may treat blank/unknown boatType like a wake grid boat.
 * Keeps GET /api/booking/slots, {@link allowBoatTypeForSlug}, and this helper aligned.
 */
function watersportsUntypedBoatAllowedForCharter(): boolean {
  if (typeof process === "undefined") return false;
  return process.env.NEXT_PUBLIC_BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT === "true";
}

/** True when listing boat `boatType` is the wake/wakesurf grid family (case-insensitive). */
export function isWakeListingBoatType(boatType: string | undefined): boolean {
  if (typeof boatType !== "string") return false;
  const t = boatType.trim().toLowerCase();
  if (t === "wake") return true;
  if (t === "wakesurf" || t === "wake-surf" || t === "wakeboard" || t === "wake-board" || t === "wake board") return true;
  return false;
}

/** Pontoon / tritoon — excluded from wake-style grids on watersports listings. */
export function isPontoonOrTritoonBoatType(boatType: string | undefined): boolean {
  const b = (boatType ?? "").toLowerCase().trim();
  return b === "pontoon" || b === "tritoon";
}

/**
 * Charter calendar should use {@link getSlotGridWakeBoard} when the boat is explicitly wake-typed,
 * or when watersports + legacy untyped is intentionally enabled (see env in {@link watersportsUntypedBoatAllowedForCharter}).
 * Blank/unknown boat type does not implicitly get the wake grid unless that env is set.
 * Must stay in sync with GET /api/booking/slots, {@link allowBoatTypeForSlug}, and {@link isListingBoatCharterStartTimeAllowed}.
 */
export function shouldUseWakeBoardCharterGrid(boatType: string | undefined, watersportsExperience: boolean): boolean {
  if (isWakeListingBoatType(boatType)) return true;
  if (!watersportsExperience) return false;
  if (isPontoonOrTritoonBoatType(boatType)) return false;
  const b = (boatType ?? "").trim();
  if (b === "") return watersportsUntypedBoatAllowedForCharter();
  return false;
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
  durationHours: number,
  watersportsExperience?: boolean
): boolean {
  if (shouldUseWakeBoardCharterGrid(boat.boatType, watersportsExperience === true)) {
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

const WEEKDAY_SHORT_TO_NUM: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Weekday 0=Sunday … 6=Saturday for dateStr (YYYY-MM-DD) in {@link SLOT_TIMEZONE}. */
export function getWeekdayInSlotTimezone(dateStr: string): number {
  const noonUtc = new Date(`${dateStr}T12:00:00.000Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SLOT_TIMEZONE,
    weekday: "short",
  }).formatToParts(noonUtc);
  const w = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  return WEEKDAY_SHORT_TO_NUM[w] ?? 0;
}

/** True if dateStr (YYYY-MM-DD) is a Saturday in America/Chicago. */
export function isSaturdayInSlotTimezone(dateStr: string): boolean {
  return getWeekdayInSlotTimezone(dateStr) === 6;
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
  departureMinute: number = 0,
  /** When non-empty, only dates whose weekday (Chicago) is in this set get a slot. */
  allowedWeekdays?: readonly number[] | null
): SlotGridItem[] {
  const out: SlotGridItem[] = [];
  const now = new Date();
  const todayStr = getTodayDateStr(now);
  const startStr = getDateStrInSlotTimezone(startDate);
  const endStr = getDateStrInSlotTimezone(endDate);
  const restrict = allowedWeekdays != null && allowedWeekdays.length > 0;
  for (let dateStr = startStr; dateStr <= endStr; dateStr = nextDateStr(dateStr)) {
    if (restrict && !allowedWeekdays!.includes(getWeekdayInSlotTimezone(dateStr))) continue;
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
