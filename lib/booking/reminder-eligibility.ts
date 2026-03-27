/**
 * Shared time-window and status rules for guest reminder and final-payment cron paths.
 * Due-retry phases must use the same rules as the main query path.
 */

import { parseSlotId, getSlotStartEnd, getDateStrInSlotTimezone } from "@/lib/booking/experience-slots";
import type { Booking } from "@/lib/booking/types";
import type { ReminderTemplateKey } from "@/lib/booking/reminder-retry";

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/** Trip reminders only for confirmed reservations — not unpaid / action-required / failed final-charge states. */
export const REMINDER_PAID_STATUSES = ["paid", "final_paid", "final_due"] as const;

export function in1WeekWindow(tripStartMs: number, nowMs: number): boolean {
  const diff = tripStartMs - nowMs;
  return diff >= 6.5 * ONE_DAY_MS && diff <= 7.5 * ONE_DAY_MS;
}

export function in24hWindow(tripStartMs: number, nowMs: number): boolean {
  const diff = tripStartMs - nowMs;
  return diff >= 23 * ONE_HOUR_MS && diff <= 25 * ONE_HOUR_MS;
}

export function inDayOfWindow(tripStartMs: number, nowMs: number): boolean {
  const diff = tripStartMs - nowMs;
  return diff >= 2.5 * ONE_HOUR_MS && diff <= 3.5 * ONE_HOUR_MS;
}

export function in48hWindow(tripStartMs: number, nowMs: number): boolean {
  const diff = tripStartMs - nowMs;
  return diff >= 46 * ONE_HOUR_MS && diff <= 50 * ONE_HOUR_MS;
}

/** Fractional hours from `nowMs` until trip start (may be negative if the trip already started). */
export function getHoursUntilTrip(tripStartMs: number, nowMs: number): number {
  return (tripStartMs - nowMs) / ONE_HOUR_MS;
}

type BookingReminderFields = Booking & {
  reminder1WeekSentAt?: unknown;
  reminder24hSentAt?: unknown;
  reminderDayOfSentAt?: unknown;
};

/** Same eligibility as main reminder query for a given template (paid statuses + time window + not already sent). */
export function isBookingEligibleForReminderRetry(
  booking: BookingReminderFields,
  templateKey: "reminder_1week" | "reminder_24h" | "reminder_dayof",
  nowMs: number
): boolean {
  if (!REMINDER_PAID_STATUSES.includes(booking.status as (typeof REMINDER_PAID_STATUSES)[number])) {
    return false;
  }
  const slotId = booking.slotId;
  if (!slotId) return false;
  const parsed = parseSlotId(slotId);
  if (!parsed) return false;
  const tripStart = getSlotStartEnd(
    parsed.dateStr,
    parsed.startHour,
    parsed.durationHours ?? 2,
    parsed.startMinute ?? 0
  ).start;
  const tripStartMs = tripStart.getTime();

  if (templateKey === "reminder_1week") {
    return !booking.reminder1WeekSentAt && in1WeekWindow(tripStartMs, nowMs);
  }
  if (templateKey === "reminder_24h") {
    return !booking.reminder24hSentAt && in24hWindow(tripStartMs, nowMs);
  }
  return !booking.reminderDayOfSentAt && inDayOfWindow(tripStartMs, nowMs);
}

export const FINAL_PAYMENT_REQUEST_STATUSES = ["final_due", "final_requires_action", "final_failed"] as const;

type BookingFinalPayFields = Booking & { finalPaymentRequestSentAt?: unknown };

/** Same eligibility as main final-payment-request scan (status + not sent + window + amount + slot). */
export function isBookingEligibleForFinalPaymentRequestRetry(
  booking: BookingFinalPayFields,
  nowMs: number
): boolean {
  if (
    !FINAL_PAYMENT_REQUEST_STATUSES.includes(booking.status as (typeof FINAL_PAYMENT_REQUEST_STATUSES)[number])
  ) {
    return false;
  }
  if (booking.finalPaymentRequestSentAt) return false;
  const slotId = booking.slotId;
  if (!slotId) return false;
  const parsed = parseSlotId(slotId.trim());
  if (!parsed) return false;
  const tripStart = getSlotStartEnd(
    parsed.dateStr,
    parsed.startHour,
    parsed.durationHours ?? 2,
    parsed.startMinute ?? 0
  ).start;
  const tripStartMs = tripStart.getTime();
  if (!in48hWindow(tripStartMs, nowMs)) return false;
  const finalCents = booking.stripe?.finalAmountCents ?? 0;
  if (finalCents <= 0) return false;
  const toEmail = booking.customer?.email?.trim();
  if (!toEmail) return false;
  return true;
}

/** Trip window strings for final_charge_success retry (48h cron uses similar date bounds). */
export function getFinalPaymentCronWindowDateStrs(nowMs: number): { windowStartStr: string; windowEndStr: string } {
  return {
    windowStartStr: getDateStrInSlotTimezone(new Date(nowMs + 0 * ONE_DAY_MS)),
    windowEndStr: getDateStrInSlotTimezone(new Date(nowMs + 5 * ONE_DAY_MS)),
  };
}
