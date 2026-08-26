import { fromZonedTime } from "date-fns-tz";
import { SLOT_TIMEZONE } from "@/lib/booking/experience-slots";

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export const MARKETPLACE_TIMEZONE = SLOT_TIMEZONE;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function parseClockTime(raw: string): { hour: number; minute: number } | null {
  const s = raw.trim();
  const ampm = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (ampm) {
    let hour = parseInt(ampm[1], 10);
    const minute = ampm[2] ? parseInt(ampm[2], 10) : 0;
    const mer = ampm[3].toLowerCase();
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
    if (mer === "am") {
      if (hour === 12) hour = 0;
    } else if (hour !== 12) {
      hour += 12;
    }
    return { hour, minute };
  }
  const mil = s.match(/^(\d{1,2}):(\d{2})$/);
  if (mil) {
    const hour = parseInt(mil[1], 10);
    const minute = parseInt(mil[2], 10);
    if (hour > 23 || minute > 59) return null;
    return { hour, minute };
  }
  const compact = s.match(/^(\d{2})(\d{2})$/);
  if (compact) {
    const hour = parseInt(compact[1], 10);
    const minute = parseInt(compact[2], 10);
    if (hour > 23 || minute > 59) return null;
    return { hour, minute };
  }
  return null;
}

export function parseCalendarDate(raw: string): { y: number; m: number; d: number } | null {
  const s = raw.replace(/,/g, " ").replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return { y: Number(iso[1]), m: Number(iso[2]), d: Number(iso[3]) };
  }
  const dmy = s.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/i);
  if (dmy) {
    const month = MONTHS[dmy[2].toLowerCase()];
    if (!month) return null;
    return { y: Number(dmy[3]), m: month, d: Number(dmy[1]) };
  }
  const mdY = s.match(/^(?:[a-z]{3,9}\s+)?([a-z]+)\s+(\d{1,2})\s+(\d{4})$/i);
  if (mdY) {
    const month = MONTHS[mdY[1].toLowerCase()];
    if (!month) return null;
    return { y: Number(mdY[3]), m: month, d: Number(mdY[2]) };
  }
  const embedded = s.match(/([a-z]{3,9}\s+[a-z]+\s+\d{1,2}\s+\d{4}|\d{1,2}\s+[a-z]+\s+\d{4})/i);
  if (embedded && embedded[1] !== s) return parseCalendarDate(embedded[1]);
  return null;
}

export function chicagoDateTime(dateStr: string, hour: number, minute: number): Date {
  return fromZonedTime(`${dateStr}T${pad2(hour)}:${pad2(minute)}:00`, MARKETPLACE_TIMEZONE);
}

/** Parse values like `Aug 21, 2026 • 11:00 AM` as America/Chicago local time. */
export function parseMarketplaceDateTime(raw: string): Date | null {
  const cleaned = raw.replace(/[•·|]/g, " ").replace(/\s+/g, " ").trim();
  const dmyTime = cleaned.match(
    /^(\d{1,2})\s+([a-z]+)\s+(\d{4})\s*[-–]\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))$/i
  );
  if (dmyTime) {
    const month = MONTHS[dmyTime[2].toLowerCase()];
    const clock = parseClockTime(dmyTime[4]);
    if (month && clock) {
      return chicagoDateTime(`${dmyTime[3]}-${pad2(month)}-${pad2(Number(dmyTime[1]))}`, clock.hour, clock.minute);
    }
  }
  const withTime = cleaned.match(
    /(?:[a-z]{3,9},?\s+)?([a-z]+)\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}:\d{2})/i
  );
  if (withTime) {
    const month = MONTHS[withTime[1].toLowerCase()];
    if (!month) return null;
    const clock = parseClockTime(withTime[4]);
    if (!clock) return null;
    const dateStr = `${withTime[3]}-${pad2(month)}-${pad2(Number(withTime[2]))}`;
    return chicagoDateTime(dateStr, clock.hour, clock.minute);
  }
  const dateOnly = parseCalendarDate(cleaned);
  if (!dateOnly) return null;
  return chicagoDateTime(`${dateOnly.y}-${pad2(dateOnly.m)}-${pad2(dateOnly.d)}`, 0, 0);
}

export function parseSplitDateAndTime(dateRaw: string, timeRaw: string): Date | null {
  const date = parseCalendarDate(dateRaw.replace(/,/g, " "));
  const clock = parseClockTime(timeRaw);
  if (!date || !clock) return null;
  return chicagoDateTime(`${date.y}-${pad2(date.m)}-${pad2(date.d)}`, clock.hour, clock.minute);
}

export function durationHoursBetween(start: Date, end: Date): number | null {
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const rounded = Math.round(ms / 3_600_000);
  return rounded >= 1 ? rounded : null;
}

export function toSlotParts(start: Date, durationHours: number): {
  dateStr: string;
  startHour: number;
  startMinute: number;
  durationHours: number;
} | null {
  if (!Number.isInteger(durationHours) || durationHours < 1) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MARKETPLACE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(start);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const y = get("year");
  const m = get("month");
  const d = get("day");
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  if (!y || !m || !d || !Number.isInteger(hour)) return null;
  if (minute !== 0 && minute !== 30) return null;
  return { dateStr: `${y}-${m}-${d}`, startHour: hour, startMinute: minute, durationHours };
}
