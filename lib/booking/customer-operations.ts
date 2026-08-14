import { siteConfig } from "@/config/site";

export type WeeklyScheduleDay = {
  weekday: number;
  closed: boolean;
  openHour: number;
  openMinute: number;
  closeHour: number;
  closeMinute: number;
};

export function useFixedCharterWindows(): boolean {
  return siteConfig.booking.slotSelectionMode === "fixed-windows";
}

export function getWeeklySchedule(): WeeklyScheduleDay[] | null {
  const rows = siteConfig.operations?.weeklySchedule;
  return rows?.length ? rows : null;
}

export function getOperatingStartHour(): number {
  const oh = siteConfig.operations?.operatingHours;
  if (oh?.firstDepartureHour != null) return oh.firstDepartureHour;
  if (oh?.startHour != null) return oh.startHour;
  return 7;
}

export function getOperatingEndHour(): number {
  const oh = siteConfig.operations?.operatingHours;
  if (oh?.lastDepartureHour != null) return oh.lastDepartureHour + 1;
  if (oh?.endHour != null) return oh.endHour;
  return 19;
}

export function getMinimumNoticeHours(): number {
  const hours = siteConfig.booking.minimumNoticeHours;
  if (typeof hours === "number" && Number.isFinite(hours) && hours >= 0) return hours;
  return 48;
}

export function getDepositLeadTimeHours(): number {
  const timing = siteConfig.booking.balanceTiming;
  if (timing === "at_booking") return 0;
  if (timing === "on_arrival") return 0;
  const hours = siteConfig.booking.balanceHoursBefore;
  if (typeof hours === "number" && Number.isFinite(hours) && hours >= 0) return hours;
  return getMinimumNoticeHours();
}

export function getTurnaroundMinutes(): number {
  const minutes = siteConfig.booking.turnaroundMinutes;
  if (typeof minutes === "number" && Number.isFinite(minutes) && minutes >= 0) return minutes;
  return 0;
}

export function getDaySchedule(weekday: number): WeeklyScheduleDay | null {
  const weekly = getWeeklySchedule();
  if (!weekly) return null;
  return weekly.find((d) => d.weekday === weekday) ?? null;
}

export function isOperatingWeekday(weekday: number): boolean {
  const day = getDaySchedule(weekday);
  if (day) return !day.closed;
  return true;
}

export function getDayOperatingBounds(weekday: number): { startHour: number; endHour: number } {
  const day = getDaySchedule(weekday);
  if (day && !day.closed) {
    const start = day.openHour + day.openMinute / 60;
    const end = day.closeHour + day.closeMinute / 60;
    return { startHour: start, endHour: end };
  }
  return { startHour: getOperatingStartHour(), endHour: getOperatingEndHour() };
}

export function getFuelGratuityConfig() {
  return siteConfig.operations?.fuelGratuity ?? null;
}

export function getWeatherPolicyText(): string | null {
  return siteConfig.operations?.weatherPolicyText?.trim() || null;
}

export function getSafetyPolicyText(): string | null {
  return siteConfig.operations?.safetyPolicyText?.trim() || null;
}

export function getAlcoholPolicyText(): string | null {
  return siteConfig.operations?.alcoholPolicyText?.trim() || null;
}

export function getRefundPolicyText(): string | null {
  return siteConfig.booking.refundPolicyText?.trim() || null;
}

export function getMinAgePolicy(): number | null {
  const age = siteConfig.booking.minAge;
  return typeof age === "number" && age > 0 ? age : null;
}

export type BalanceTiming = "at_booking" | "hours_before" | "on_arrival";

export function getBalanceTiming(): BalanceTiming {
  const timing = siteConfig.booking.balanceTiming;
  if (timing === "at_booking" || timing === "on_arrival" || timing === "hours_before") return timing;
  return "hours_before";
}

/** When false, deposit bookings stay final_due but no auto finalChargeAt / cron charge. */
export function shouldAutoChargeRemainingBalance(): boolean {
  return getBalanceTiming() === "hours_before";
}

/** When true, checkout always collects the full trip total (no deposit option). */
export function shouldForceFullPaymentAtCheckout(): boolean {
  return getBalanceTiming() === "at_booking";
}
