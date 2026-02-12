/**
 * Experience slot grid: all dates are available until booked or blocked.
 * Slot id format: YYYY-MM-DD-startHour-durationHours (e.g. 2025-02-10-13-3).
 *
 * Operating hours: 7am–midnight. Start times are every hour from 7am up to the latest
 * start that still finishes by midnight (e.g. 8hr charter can only start by 4pm).
 */

/** Operating window: 7am (7) to midnight (24). End is exclusive (trip must end by midnight). */
export const OPERATING_START_HOUR = 7;
export const OPERATING_END_HOUR = 24;

/** Hourly start times from 7am through 11pm (23). Use with end-time filter per duration. */
export const EXPERIENCE_START_HOURS = Array.from(
  { length: OPERATING_END_HOUR - OPERATING_START_HOUR },
  (_, i) => OPERATING_START_HOUR + i
) as number[];

export function parseSlotId(slotId: string): { dateStr: string; startHour: number; durationHours: number } | null {
  const parts = slotId.split("-");
  if (parts.length < 5) return null;
  const dateStr = `${parts[0]}-${parts[1]}-${parts[2]}`;
  const startHour = parseInt(parts[3], 10);
  const durationHours = parseInt(parts[4], 10);
  if (Number.isNaN(startHour) || Number.isNaN(durationHours)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  return { dateStr, startHour, durationHours };
}

export function buildSlotId(dateStr: string, startHour: number, durationHours: number): string {
  return `${dateStr}-${startHour}-${durationHours}`;
}

export function getSlotStartEnd(dateStr: string, startHour: number, durationHours: number): { start: Date; end: Date } {
  const start = new Date(dateStr + "T" + String(startHour).padStart(2, "0") + ":00:00");
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Latest start hour for a given duration so the charter ends by OPERATING_END_HOUR.
 * E.g. 8hr → start by 16 (4pm); 3hr → start by 21 (9pm); 1hr → start by 23 (11pm).
 */
export function getLatestStartHourForDuration(durationHours: number): number {
  return Math.max(OPERATING_START_HOUR, OPERATING_END_HOUR - durationHours);
}

/** Generate (dateStr, startHour, durationHours) for the given range; excludes past times. */
export function getSlotGrid(
  startDate: Date,
  endDate: Date,
  durationHoursList: number[]
): { dateStr: string; startHour: number; durationHours: number }[] {
  const out: { dateStr: string; startHour: number; durationHours: number }[] = [];
  const now = new Date();
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    for (const durationHours of durationHoursList) {
      const latestStart = getLatestStartHourForDuration(durationHours);
      for (let startHour = OPERATING_START_HOUR; startHour <= latestStart; startHour++) {
        const { start: slotStart } = getSlotStartEnd(dateStr, startHour, durationHours);
        if (slotStart >= now) out.push({ dateStr, startHour, durationHours });
      }
    }
  }
  return out;
}
