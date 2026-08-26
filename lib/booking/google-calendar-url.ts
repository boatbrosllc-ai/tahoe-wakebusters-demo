import { BOOKING_DISPLAY_TIMEZONE } from "./format-booking-datetime";

function pad2(n: string): string {
  return n.padStart(2, "0");
}

/** Local wall time in America/Chicago as Google Calendar `dates` fragment (YYYYMMDDTHHmmss). */
export function formatGoogleCalendarLocalStamp(d: Date, timeZone = BOOKING_DISPLAY_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  let hour = get("hour");
  if (hour === "24") hour = "00";
  return `${get("year")}${pad2(get("month"))}${pad2(get("day"))}T${pad2(hour)}${pad2(get("minute"))}${pad2(get("second"))}`;
}

export function buildGoogleCalendarTemplateUrl(opts: {
  title: string;
  start: Date;
  end: Date;
  details?: string;
  location?: string;
  timeZone?: string;
}): string | null {
  if (Number.isNaN(opts.start.getTime()) || Number.isNaN(opts.end.getTime())) return null;
  if (opts.end.getTime() <= opts.start.getTime()) return null;
  const tz = opts.timeZone ?? BOOKING_DISPLAY_TIMEZONE;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title.trim() || "Boat Bros trip",
    dates: `${formatGoogleCalendarLocalStamp(opts.start, tz)}/${formatGoogleCalendarLocalStamp(opts.end, tz)}`,
    ctz: tz,
  });
  const details = opts.details?.trim();
  if (details) params.set("details", details);
  const location = opts.location?.trim();
  if (location) params.set("location", location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
