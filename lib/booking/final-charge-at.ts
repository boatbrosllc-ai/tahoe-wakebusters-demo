/**
 * Final off-session charge time: exactly 48 clock hours before trip start in America/Chicago
 * (avoids DST drift from raw UTC millisecond subtraction).
 */

import { subHours } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const CHICAGO = "America/Chicago";
export const DEPOSIT_LEAD_TIME_HOURS = 48;
export const DEPOSIT_LEAD_TIME_MS = DEPOSIT_LEAD_TIME_HOURS * 60 * 60 * 1000;

/** True when the cron final-charge instant (48 America/Chicago local hours before trip start) is still after `nowMs`. */
export function isDepositEligibleByLeadTime(slotStartMs: number, nowMs: number): boolean {
  const finalChargeAt = computeFinalChargeAtUtc(new Date(slotStartMs));
  return finalChargeAt.getTime() > nowMs;
}

export function computeFinalChargeAtUtc(slotStartUtc: Date): Date {
  const inChicago = toZonedTime(slotStartUtc, CHICAGO);
  const minus48LocalHours = subHours(inChicago, 48);
  return fromZonedTime(minus48LocalHours, CHICAGO);
}
