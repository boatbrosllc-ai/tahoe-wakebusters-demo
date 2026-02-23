/**
 * Canonical formatting for booking/slot dates and times.
 * All display uses America/Chicago (Austin) so what the user booked is what they see everywhere:
 * app, emails, success page, admin. Never use server local or browser local for booking times.
 */

export const BOOKING_DISPLAY_TIMEZONE = "America/Chicago";

const EN_US = "en-US" as const;
const OPTS_FULL: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: BOOKING_DISPLAY_TIMEZONE,
};
const OPTS_TIME: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
  timeZone: BOOKING_DISPLAY_TIMEZONE,
};
const OPTS_DATE: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: BOOKING_DISPLAY_TIMEZONE,
};

/**
 * Full date + time for emails and receipts (e.g. "Sat, Mar 15, 2025, 11:00 AM").
 * Use for confirmation email "Date & time" and any single line showing start or end.
 */
export function formatBookingDateTime(d: Date): string {
  return d.toLocaleString(EN_US, OPTS_FULL);
}

/**
 * Time only (e.g. "11:00 AM"). Use for slot picker labels and "Time:" display.
 */
export function formatBookingTime(d: Date): string {
  return d.toLocaleTimeString(EN_US, OPTS_TIME);
}

/**
 * Time only, safe for invalid dates (returns "—" instead of "Invalid Date").
 * Use in admin/list when slotId may be malformed.
 */
export function formatBookingTimeSafe(d: Date): string {
  if (typeof d?.getTime !== "function" || Number.isNaN(d.getTime())) return "—";
  return formatBookingTime(d);
}

/**
 * Date only (e.g. "Sat, Mar 15, 2025"). Use when time is shown separately.
 */
export function formatBookingDate(d: Date): string {
  return d.toLocaleDateString(EN_US, OPTS_DATE);
}

/**
 * Format a Firestore timestamp for email/display. Uses America/Chicago.
 */
export function formatSlotDateTime(ts: { toDate(): Date }): string {
  return formatBookingDateTime(ts.toDate());
}

/**
 * Time only from an ISO date string (e.g. slot.startAt from API). Safe for client and server.
 */
export function formatBookingTimeFromIso(iso: string): string {
  return formatBookingTime(new Date(iso));
}

/**
 * Full date + time from an ISO string. Safe for client and server.
 */
export function formatBookingDateTimeFromIso(iso: string): string {
  return formatBookingDateTime(new Date(iso));
}

/**
 * Returns the YYYY-MM-DD calendar date for a UTC ISO string in America/Chicago timezone.
 * Use this instead of iso.slice(0, 10) for slot times — late-evening slots (e.g. 7pm CST)
 * have a UTC timestamp on the following day, so slicing gives the wrong calendar date.
 */
export function isoToChicagoDateStr(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_DISPLAY_TIMEZONE,
  }).format(new Date(iso));
}
