/**
 * Default cancellation policy text used when experience/boat does not override.
 * Keep in sync with customer-facing copy (BookingModal, emails).
 *
 * Values come from `config/site.ts` → `booking.cancellation`.
 */

import { siteConfig } from "@/config/site";
import type { ExperienceCancellationPolicy } from "@/lib/booking/types";

const c = siteConfig.booking.cancellation;

/** Full policy text for display in booking flow and emails. */
export const DEFAULT_CANCELLATION_POLICY = c.fullText;

/** Short summary (e.g. for compact UI). */
export const DEFAULT_CANCELLATION_SUMMARY = c.summary;

/** Structured default aligned with {@link DEFAULT_CANCELLATION_POLICY} (snapshot on booking creation). */
export const DEFAULT_EXPERIENCE_CANCELLATION_POLICY: ExperienceCancellationPolicy = {
  freeCancelDays: c.freeCancelDays,
  partialRefundDaysStart: c.partialRefundDaysStart,
  partialRefundDaysEnd: c.partialRefundDaysEnd,
  noRefundWithinDays: c.noRefundWithinDays,
  fullText: c.fullText,
};
