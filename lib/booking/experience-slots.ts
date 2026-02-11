/**
 * Experience slot grid: all dates are available until booked or blocked.
 * Slot id format: YYYY-MM-DD-startHour-durationHours (e.g. 2025-02-10-11-4).
 */

export const EXPERIENCE_START_HOURS = [11, 14, 17] as const;

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
    for (const startHour of EXPERIENCE_START_HOURS) {
      for (const durationHours of durationHoursList) {
        const { start: slotStart } = getSlotStartEnd(dateStr, startHour, durationHours);
        if (slotStart >= now) out.push({ dateStr, startHour, durationHours });
      }
    }
  }
  return out;
}
