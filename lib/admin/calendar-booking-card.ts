/** Pure helpers for admin calendar booking cards (display + dedupe). */

export type CalendarBookingSummary = {
  slotId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  durationHours?: number | null;
};

export type CalendarSlotRow = {
  id: string;
  bookingSummary?: CalendarBookingSummary | null;
};

/** Prefer canonical booking trip time over overlap grid row slot id. */
export function bookingCardDisplayTime<T extends CalendarSlotRow>(
  slot: T,
  formatSlotTime: (slot: T) => string
): string {
  const summary = slot.bookingSummary;
  if (summary?.startTime) return summary.startTime;
  return formatSlotTime(slot);
}

/** Duration label for booking cards; prefers booking doc hours. */
export function bookingCardDurationHours(slot: {
  bookingSummary?: CalendarBookingSummary | null;
  bookingDurationHours?: number;
}): number | null {
  const summary = slot.bookingSummary;
  if (typeof summary?.durationHours === "number" && summary.durationHours > 0) {
    return summary.durationHours;
  }
  if (typeof slot.bookingDurationHours === "number" && slot.bookingDurationHours > 0) {
    return slot.bookingDurationHours;
  }
  return null;
}

export function formatDurationHoursLabel(hours: number): string {
  return hours === 1 ? "1 hr" : `${hours} hr`;
}

/** When multiple grid rows share one bookingId, keep the row matching the booking's slotId. */
export function pickCanonicalBookingSlotRow<T extends CalendarSlotRow>(existing: T, candidate: T): T {
  const summary = existing.bookingSummary ?? candidate.bookingSummary;
  const canonicalSlotId = summary?.slotId?.trim();
  if (canonicalSlotId) {
    if (existing.id === canonicalSlotId) return existing;
    if (candidate.id === canonicalSlotId) return candidate;
  }
  if (existing.bookingSummary?.startTime && !candidate.bookingSummary?.startTime) return existing;
  if (candidate.bookingSummary?.startTime && !existing.bookingSummary?.startTime) return candidate;
  return existing;
}
