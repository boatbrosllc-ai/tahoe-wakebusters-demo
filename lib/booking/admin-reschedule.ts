/**
 * Admin reschedule helpers: lock ticketed trips to the listing departure,
 * keep charter :30 starts, and serialize the "was rescheduled" marker.
 */
import { isWakeSurfClubSlug } from "@/lib/booking/experience-aliases";
import { buildSlotId, getSlotStartEnd, parseSlotId, type ParsedSlotId } from "@/lib/booking/experience-slots";
import { formatBookingTime, formatTripDateYyyyMmDd } from "@/lib/booking/format-booking-datetime";
import { isTicketedOperatingDate } from "@/lib/booking/ticketed-slot-utils";

export type RescheduleHistoryEntry = {
  fromSlotId: string;
  toSlotId: string;
  fromDateStr: string;
  toDateStr: string;
  at: string;
};

export type AdminRescheduleExperience = {
  pricingType?: string | null;
  slug?: string | null;
  title?: string | null;
  name?: string | null;
  departureHour?: number | null;
  departureMinute?: number | null;
  tripDurationHours?: number | null;
  ticketedWeekdays?: unknown;
};

export function isSharedTicketedReschedule(input: {
  bookingMode?: string | null;
  pricingType?: string | null;
  boatId?: string | null;
}): boolean {
  if (input.bookingMode === "shared") return true;
  if (input.pricingType === "ticketed" && !input.boatId) return true;
  return false;
}

/**
 * Club / sunset tickets share one departure. Do not run exclusive charter occupancy
 * (any overlapping ticket, any operator block, boat slot docs) — leftover tickets
 * would be reported as "This slot is blocked".
 */
export function rescheduleUsesExclusiveSlotOccupancy(input: {
  bookingMode?: string | null;
  pricingType?: string | null;
}): boolean {
  return !(input.bookingMode === "shared" && input.pricingType === "ticketed");
}

export function clockValueFromSlot(parsed: { startHour: number; startMinute?: number }): string {
  const minute = parsed.startMinute === 30 ? 30 : 0;
  return `${parsed.startHour}:${minute === 30 ? "30" : "00"}`;
}

export function parseClockValue(value: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(00|30)$/.exec(value.trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return { hour, minute };
}

export function charterRescheduleStartOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let hour = 7; hour <= 19; hour++) {
    for (const minute of hour === 19 ? [0] : [0, 30]) {
      const value = clockValueFromSlot({ startHour: hour, startMinute: minute });
      const { start } = getSlotStartEnd("2026-01-15", hour, 1, minute);
      out.push({ value, label: formatBookingTime(start) });
    }
  }
  return out;
}

export function formatSlotIdAdminLabel(slotId: string): string {
  const parsed = parseSlotId(slotId);
  if (!parsed) return slotId;
  const { start } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
  return `${formatTripDateYyyyMmDd(parsed.dateStr)} · ${formatBookingTime(start)}`;
}

export type ResolveRescheduleTargetResult =
  | { ok: true; slotId: string; parsed: ParsedSlotId; sameSlot: boolean }
  | { ok: false; code: "INVALID_DATE" | "TICKETED_DAY_NOT_OPERATING" | "INVALID_SLOT"; error: string };

export function resolveAdminRescheduleTarget(input: {
  oldSlotId: string;
  requestedDateStr: string;
  requestedHour?: number;
  requestedMinute?: number;
  experience: AdminRescheduleExperience;
  bookingMode?: string | null;
  boatId?: string | null;
  rateDurationHours?: number | null;
}): ResolveRescheduleTargetResult {
  const dateStr = input.requestedDateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { ok: false, code: "INVALID_DATE", error: "Pick a valid date." };
  }
  const oldParsed = parseSlotId(input.oldSlotId);
  if (!oldParsed) {
    return { ok: false, code: "INVALID_SLOT", error: "This booking is missing a usable trip time." };
  }

  const ticketed = isSharedTicketedReschedule({
    bookingMode: input.bookingMode,
    pricingType: input.experience.pricingType,
    boatId: input.boatId,
  });

  if (ticketed && !isTicketedOperatingDate(dateStr, input.experience.ticketedWeekdays)) {
    const slug = typeof input.experience.slug === "string" ? input.experience.slug : "";
    const error = isWakeSurfClubSlug(slug)
      ? "Wake Surf Club does not run on that date. Pick a day the club is actually scheduled (Wednesday or Sunday)."
      : "This listing does not run on that date. Pick a day it operates.";
    return { ok: false, code: "TICKETED_DAY_NOT_OPERATING", error };
  }

  let hour = oldParsed.startHour;
  let minute = oldParsed.startMinute ?? 0;
  let duration = oldParsed.durationHours;
  if (ticketed) {
    if (typeof input.experience.departureHour === "number") hour = input.experience.departureHour;
    if (typeof input.experience.departureMinute === "number") minute = input.experience.departureMinute;
    if (typeof input.experience.tripDurationHours === "number" && input.experience.tripDurationHours > 0) {
      duration = input.experience.tripDurationHours;
    } else if (typeof input.rateDurationHours === "number" && input.rateDurationHours > 0) {
      duration = input.rateDurationHours;
    }
  } else {
    if (typeof input.requestedHour === "number") hour = input.requestedHour;
    if (typeof input.requestedMinute === "number") minute = input.requestedMinute;
  }

  const slotId = buildSlotId(dateStr, hour, duration, minute);
  const parsed = parseSlotId(slotId);
  if (!parsed) {
    return { ok: false, code: "INVALID_SLOT", error: "Could not build a valid trip time for that date." };
  }
  return { ok: true, slotId, parsed, sameSlot: slotId === input.oldSlotId };
}

export function newRescheduleHistoryEntry(fromSlotId: string, toSlotId: string, at = new Date()): RescheduleHistoryEntry {
  const from = parseSlotId(fromSlotId);
  const to = parseSlotId(toSlotId);
  return {
    fromSlotId,
    toSlotId,
    fromDateStr: from?.dateStr ?? "",
    toDateStr: to?.dateStr ?? "",
    at: at.toISOString(),
  };
}

function timestampToIso(ts: unknown): string | null {
  if (!ts) return null;
  if (typeof ts === "string") return ts;
  if (typeof ts === "object") {
    const t = ts as { toDate?: () => Date; seconds?: number };
    if (typeof t.toDate === "function") return t.toDate().toISOString();
    if (typeof t.seconds === "number") return new Date(t.seconds * 1000).toISOString();
  }
  return null;
}

function normalizeHistory(raw: unknown): RescheduleHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: RescheduleHistoryEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Partial<RescheduleHistoryEntry>;
    if (typeof r.fromSlotId !== "string" || typeof r.toSlotId !== "string") continue;
    out.push({
      fromSlotId: r.fromSlotId,
      toSlotId: r.toSlotId,
      fromDateStr: typeof r.fromDateStr === "string" ? r.fromDateStr : "",
      toDateStr: typeof r.toDateStr === "string" ? r.toDateStr : "",
      at: typeof r.at === "string" ? r.at : "",
    });
  }
  return out.slice(-10);
}

export function pickAdminRescheduleFields(booking: {
  bookingMode?: string | null;
  pricingType?: string | null;
  rescheduledAt?: unknown;
  rescheduledFromSlotId?: string | null;
  rescheduledFromStartDateStr?: string | null;
  rescheduleCount?: number | null;
  rescheduleHistory?: unknown;
}): {
  bookingMode: string | null;
  pricingType: string | null;
  rescheduledAt: string | null;
  rescheduledFromSlotId: string | null;
  rescheduledFromStartDateStr: string | null;
  rescheduleCount: number;
  rescheduleHistory: RescheduleHistoryEntry[];
} {
  return {
    bookingMode: booking.bookingMode ?? null,
    pricingType: booking.pricingType ?? null,
    rescheduledAt: timestampToIso(booking.rescheduledAt),
    rescheduledFromSlotId: booking.rescheduledFromSlotId ?? null,
    rescheduledFromStartDateStr: booking.rescheduledFromStartDateStr ?? null,
    rescheduleCount: typeof booking.rescheduleCount === "number" ? booking.rescheduleCount : 0,
    rescheduleHistory: normalizeHistory(booking.rescheduleHistory),
  };
}
