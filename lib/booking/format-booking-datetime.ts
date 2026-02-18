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
