/**
 * Single operational timezone for Nasty Sport Fishing boat/trip operations.
 *
 * Authority: Cabo San Lucas business time (`America/Mazatlan`).
 * Kept in `lib/booking` so server booking code does not scatter string literals.
 *
 * DO NOT use for:
 * - Firestore createdAt/updatedAt (UTC timestamps)
 * - Stripe / webhook event times (UTC)
 *
 * Mazatlan does not observe DST (UTC−7 year-round). Chicago DST tests must not apply here.
 */

import { brand } from "@/content/brand";

/** IANA timezone for departures, slots, calendars, reminders, and finalChargeAt wall-clock math. */
export const BUSINESS_TIMEZONE: string =
  typeof brand.timezone === "string" && brand.timezone.trim()
    ? brand.timezone.trim()
    : "America/Mazatlan";
