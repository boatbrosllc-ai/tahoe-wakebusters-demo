/**
 * Canonical formatting for booking/slot dates and times.
 * All display uses the Nasty business timezone (Cabo / America/Mazatlan) so what the
 * guest booked is what they see in app, emails, success page, and admin.
 */

import { BUSINESS_TIMEZONE } from "@/lib/booking/business-timezone";

export const BOOKING_DISPLAY_TIMEZONE = BUSINESS_TIMEZONE;

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

export function formatBookingDateTime(d: Date): string {
  return d.toLocaleString(EN_US, OPTS_FULL);
}

export function formatBookingTime(d: Date): string {
  return d.toLocaleTimeString(EN_US, OPTS_TIME);
}

export function formatBookingTimeSafe(d: Date): string {
  if (typeof d?.getTime !== "function" || Number.isNaN(d.getTime())) return "—";
  return formatBookingTime(d);
}

export function formatBookingDate(d: Date): string {
  return d.toLocaleDateString(EN_US, OPTS_DATE);
}

export function formatSlotDateTime(ts: { toDate(): Date }): string {
  return formatBookingDateTime(ts.toDate());
}

export function formatBookingTimeFromIso(iso: string): string {
  return formatBookingTime(new Date(iso));
}

export function formatBookingDateTimeFromIso(iso: string): string {
  return formatBookingDateTime(new Date(iso));
}

/** YYYY-MM-DD calendar date for an ISO string in BUSINESS_TIMEZONE. */
export function isoToBusinessDateStr(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_DISPLAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${day}`;
}

/** @deprecated Use {@link isoToBusinessDateStr}. */
export const isoToChicagoDateStr = isoToBusinessDateStr;

const TRIP_DATE_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const TRIP_DATE_MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function formatTripDateYyyyMmDd(yyyyMmDd: string | null | undefined): string {
  if (!yyyyMmDd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd.trim())) return "—";
  const [ys, ms, ds] = yyyyMmDd.trim().split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!Number.isFinite(y) || m < 1 || m > 12 || d < 1 || d > 31) return "—";
  const weekday = TRIP_DATE_WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${TRIP_DATE_MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}

export function formatTripDateYyyyMmDdShort(yyyyMmDd: string | null | undefined): string {
  if (!yyyyMmDd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd.trim())) return "—";
  const [ys, ms, ds] = yyyyMmDd.trim().split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!Number.isFinite(y) || m < 1 || m > 12 || d < 1 || d > 31) return "—";
  return `${TRIP_DATE_MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}
