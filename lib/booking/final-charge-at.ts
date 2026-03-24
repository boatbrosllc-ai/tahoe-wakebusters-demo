/**
 * Final off-session charge time: exactly 48 clock hours before trip start in America/Chicago
 * (avoids DST drift from raw UTC millisecond subtraction).
 */

import { subHours } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const CHICAGO = "America/Chicago";

export function computeFinalChargeAtUtc(slotStartUtc: Date): Date {
  const inChicago = toZonedTime(slotStartUtc, CHICAGO);
  const minus48LocalHours = subHours(inChicago, 48);
  return fromZonedTime(minus48LocalHours, CHICAGO);
}
