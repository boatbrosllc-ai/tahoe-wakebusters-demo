import {
  getSlotStartEnd,
  getWeekdayInSlotTimezone,
  type SlotGridItem,
} from "@/lib/booking/experience-slots";
import {
  getDayOperatingBounds,
  getMinimumNoticeHours,
  getTurnaroundMinutes,
  isOperatingWeekday,
} from "@/lib/booking/customer-operations";
export function minimumNoticeMs(): number {
  return getMinimumNoticeHours() * 60 * 60 * 1000;
}

export function turnaroundMs(): number {
  return getTurnaroundMinutes() * 60 * 1000;
}

/** True when the trip start is far enough in the future for online booking. */
export function isSlotStartWithinMinimumNotice(slotStartMs: number, nowMs = Date.now()): boolean {
  return slotStartMs - nowMs >= minimumNoticeMs();
}

export function isOperatingDate(dateStr: string): boolean {
  return isOperatingWeekday(getWeekdayInSlotTimezone(dateStr));
}

export function isStartTimeAllowedForDate(
  dateStr: string,
  startHour: number,
  startMinute: number,
  durationHours: number,
): boolean {
  if (!isOperatingDate(dateStr)) return false;
  const weekday = getWeekdayInSlotTimezone(dateStr);
  const bounds = getDayOperatingBounds(weekday);
  const startDecimal = startHour + startMinute / 60;
  const endDecimal = startDecimal + durationHours;
  if (startDecimal < bounds.startHour) return false;
  if (startDecimal > bounds.endHour) return false;
  if (endDecimal > bounds.endHour + 0.01) return false;
  return true;
}

export function filterSlotGridBySchedule(items: SlotGridItem[], now = new Date()): SlotGridItem[] {
  const nowMs = now.getTime();
  return items.filter((item) => {
    if (!isStartTimeAllowedForDate(item.dateStr, item.startHour, item.startMinute ?? 0, item.durationHours)) {
      return false;
    }
    const { start } = getSlotStartEnd(item.dateStr, item.startHour, item.durationHours, item.startMinute ?? 0);
    return isSlotStartWithinMinimumNotice(start.getTime(), nowMs);
  });
}

export type SlotScheduleRejectReason = "notice" | "hours";

/** Server-side guard for hold creation — mirrors filterSlotGridBySchedule. */
export function validateSlotSchedule(
  dateStr: string,
  startHour: number,
  startMinute: number,
  durationHours: number,
  slotStartMs: number,
  nowMs = Date.now(),
): { ok: true } | { ok: false; reason: SlotScheduleRejectReason } {
  if (!isStartTimeAllowedForDate(dateStr, startHour, startMinute, durationHours)) {
    return { ok: false, reason: "hours" };
  }
  if (!isSlotStartWithinMinimumNotice(slotStartMs, nowMs)) {
    return { ok: false, reason: "notice" };
  }
  return { ok: true };
}

/** Interval overlap including configured turnaround buffer between consecutive trips. */
export function intervalsConflictWithTurnaround(  aStartMs: number,
  aEndMs: number,
  bStartMs: number,
  bEndMs: number,
  bufferMs = turnaroundMs(),
): boolean {
  const pad = Math.max(0, bufferMs);
  return aStartMs < bEndMs + pad && aEndMs + pad > bStartMs;
}
