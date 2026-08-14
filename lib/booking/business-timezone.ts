/**
 * Single operational timezone for boat/trip operations.
 *
 * Authority: `siteConfig.business.timezone` / `brand.timezone`.
 * Kept in `lib/booking` so server booking code does not scatter string literals.
 *
 * DO NOT use for:
 * - Firestore createdAt/updatedAt (UTC timestamps)
 * - Stripe / webhook event times (UTC)
 */

import { brand } from "@/content/brand";

/** IANA timezone for departures, slots, calendars, reminders, and finalChargeAt wall-clock math. */
export const BUSINESS_TIMEZONE: string =
  typeof brand.timezone === "string" && brand.timezone.trim()
    ? brand.timezone.trim()
    : "America/New_York";
