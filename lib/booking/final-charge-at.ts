/**
 * Final off-session charge time: exactly 48 clock hours before trip start in the
 * Nasty business timezone (Cabo / America/Mazatlan).
 *
 * Uses floating wall-clock arithmetic in BUSINESS_TIMEZONE (not system-local
 * `toZonedTime` + `subHours`, which mis-counts across the host machine's DST).
 */

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { BUSINESS_TIMEZONE } from "@/lib/booking/business-timezone";

export const DEPOSIT_LEAD_TIME_HOURS = 48;
export const DEPOSIT_LEAD_TIME_MS = DEPOSIT_LEAD_TIME_HOURS * 60 * 60 * 1000;

/** True when the cron final-charge instant (48 business-local hours before trip start) is still after `nowMs`. */
export function isDepositEligibleByLeadTime(slotStartMs: number, nowMs: number): boolean {
  const finalChargeAt = computeFinalChargeAtUtc(new Date(slotStartMs));
  return finalChargeAt.getTime() > nowMs;
}

/**
 * Given trip start as a UTC instant (from getSlotStartEnd), return the UTC instant
 * that is 48 local clock hours earlier in BUSINESS_TIMEZONE.
 */
export function computeFinalChargeAtUtc(slotStartUtc: Date): Date {
  const wall = formatInTimeZone(slotStartUtc, BUSINESS_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
  const [datePart, timePart] = wall.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi, s] = timePart.split(":").map(Number);
  // Treat wall components as floating civil time, subtract 48 clock hours, then re-zone.
  const floatingMs = Date.UTC(y, mo - 1, d, h, mi, s);
  const earlier = new Date(floatingMs - DEPOSIT_LEAD_TIME_MS);
  const earlierWall =
    `${earlier.getUTCFullYear()}-${String(earlier.getUTCMonth() + 1).padStart(2, "0")}-${String(earlier.getUTCDate()).padStart(2, "0")}` +
    `T${String(earlier.getUTCHours()).padStart(2, "0")}:${String(earlier.getUTCMinutes()).padStart(2, "0")}:${String(earlier.getUTCSeconds()).padStart(2, "0")}`;
  return fromZonedTime(earlierWall, BUSINESS_TIMEZONE);
}
