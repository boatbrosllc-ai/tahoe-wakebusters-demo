import { isoToChicagoDateStr } from "@/lib/booking/format-booking-datetime";
import { intervalsOverlapMs } from "@/lib/booking/booking-interval";
import { parseSlotId, parseSlotIdRelaxed } from "@/lib/booking/experience-slots";

/** Minimal slot shape for calendar open-date / open-slot derivation (modal + booking page). */
export type SlotLikeForCalendar = {
  id: string;
  status: string;
  startAt: string;
  endAt?: string;
  dateStr?: string;
  boatId?: string;
  spotsRemaining?: number;
  holdDataMissing?: boolean;
};

/**
 * BookingModal: open slots for the selected Chicago calendar date.
 * `holdDataMissing` does not exclude a row; partial mode is signaled by API metadata and confirmed before hold/checkout.
 */
export function openSlotsForDateFromMonthSlots(
  monthSlots: SlotLikeForCalendar[],
  selectedDate: string | null,
  isTicketed: boolean,
): SlotLikeForCalendar[] {
  if (!selectedDate) return [];
  return monthSlots.filter((s) => {
    if (isoToChicagoDateStr(s.startAt) !== selectedDate || s.status !== "open") return false;
    if (isTicketed && typeof s.spotsRemaining === "number" && s.spotsRemaining === 0) return false;
    return true;
  });
}

/**
 * BookingModal: dates with at least one open selectable slot in `monthSlots` (advisory; create-hold is authoritative).
 */
export function availableDateSetFromMonthSlots(monthSlots: SlotLikeForCalendar[], isTicketed: boolean): Set<string> {
  const set = new Set<string>();
  for (const s of monthSlots) {
    if (s.status !== "open") continue;
    if (isTicketed && typeof s.spotsRemaining === "number" && s.spotsRemaining === 0) continue;
    const day = isoToChicagoDateStr(s.startAt);
    if (day) set.add(day);
  }
  return set;
}

/**
 * BookingPageClient: derive clickable dates from cached slots, optionally scoped to a boat.
 */
export function availableDateSetFromSlotsWithBoat(
  allSlots: SlotLikeForCalendar[] | null,
  selectedBoat: { id: string } | null,
): Set<string> | null {
  if (allSlots === null) return null;
  const available = new Set<string>();
  for (const slot of allSlots) {
    if (slot.status !== "open") continue;
    if (typeof slot.spotsRemaining === "number" && slot.spotsRemaining === 0) continue;
    if (selectedBoat && slot.boatId !== selectedBoat.id) continue;
    const dateStr: string = slot.dateStr ?? (slot.startAt ? isoToChicagoDateStr(slot.startAt) : "");
    if (dateStr) available.add(dateStr);
  }
  return available;
}

/** BookingModal step-2 gate: when `slotsPartialData`, require selected slot in the derived open list for that date. */
export function step2SelectedSlotVerifiedOpen(
  monthSlots: SlotLikeForCalendar[],
  selectedDate: string | null,
  selectedSlot: SlotLikeForCalendar | null,
  isTicketed: boolean,
): boolean {
  if (selectedSlot == null) return false;
  return openSlotsForDateFromMonthSlots(monthSlots, selectedDate, isTicketed).some((s) => s.id === selectedSlot.id);
}

/**
 * Charter step 3: per-boat availability for the selected trip window. Uses interval overlap on
 * `startAt`/`endAt` so a shorter paid trip (e.g. 4h) still marks the boat unavailable for a longer
 * tier (e.g. 8h) at the same start time — matching GET /api/booking/slots overlap rules.
 * Rows with `holdDataMissing` are excluded from "held" classification and treated as generic unavailable.
 */
export function boatAvailabilitySetsForSelectedCharterSlot(
  monthSlots: SlotLikeForCalendar[],
  selectedSlot: Pick<SlotLikeForCalendar, "id" | "startAt" | "endAt"> | null,
  isTicketed: boolean,
): {
  availableBoatIdsForSelectedSlot: Set<string>;
  unavailableBoatIdsForSelectedSlot: Set<string>;
  bookedBoatIdsForSelectedSlot: Set<string>;
  heldBoatIdsForSelectedSlot: Set<string>;
  blockedBoatIdsForSelectedSlot: Set<string>;
} {
  const empty = new Set<string>();
  if (!selectedSlot?.startAt) {
    return {
      availableBoatIdsForSelectedSlot: empty,
      unavailableBoatIdsForSelectedSlot: empty,
      bookedBoatIdsForSelectedSlot: empty,
      heldBoatIdsForSelectedSlot: empty,
      blockedBoatIdsForSelectedSlot: empty,
    };
  }
  const selStart = new Date(selectedSlot.startAt).getTime();
  const selEndRaw = selectedSlot.endAt != null && String(selectedSlot.endAt).trim() !== ""
    ? new Date(selectedSlot.endAt).getTime()
    : NaN;
  const parsedDur = (parseSlotIdRelaxed(selectedSlot.id) ?? parseSlotId(selectedSlot.id))?.durationHours ?? null;
  const selEnd =
    Number.isFinite(selEndRaw) && !Number.isNaN(selEndRaw)
      ? selEndRaw
      : parsedDur != null && Number.isFinite(selStart)
        ? selStart + parsedDur * 3600000
        : NaN;
  if (!Number.isFinite(selStart) || !Number.isFinite(selEnd) || selEnd <= selStart) {
    return {
      availableBoatIdsForSelectedSlot: empty,
      unavailableBoatIdsForSelectedSlot: empty,
      bookedBoatIdsForSelectedSlot: empty,
      heldBoatIdsForSelectedSlot: empty,
      blockedBoatIdsForSelectedSlot: empty,
    };
  }

  const byBoat = new Map<string, SlotLikeForCalendar[]>();
  for (const s of monthSlots) {
    const boatKey = s.boatId && s.boatId.trim() ? s.boatId.trim() : isTicketed ? "_ticketed" : null;
    if (boatKey == null) continue;
    const list = byBoat.get(boatKey) ?? [];
    list.push(s);
    byBoat.set(boatKey, list);
  }

  const available = new Set<string>();
  const unavailable = new Set<string>();
  const booked = new Set<string>();
  const held = new Set<string>();
  const blocked = new Set<string>();

  byBoat.forEach((rows, boatKey) => {
    // Treat /api/booking/slots as authoritative for conflict-expanded rows:
    // classify by the exact selected slot row first (id + boat).
    const exactRows = rows.filter((r) => r.id === selectedSlot.id);
    if (exactRows.length > 0) {
      const nonOpenExact = exactRows.filter((r) => r.status !== "open");
      if (nonOpenExact.length > 0) {
        unavailable.add(boatKey);
        if (nonOpenExact.some((r) => r.status === "booked")) booked.add(boatKey);
        else if (nonOpenExact.some((r) => r.status === "held")) {
          const hasMissingHoldData = nonOpenExact.some((r) => r.status === "held" && r.holdDataMissing === true);
          if (!hasMissingHoldData) held.add(boatKey);
        } else blocked.add(boatKey);
      } else if (exactRows.some((r) => r.status === "open")) {
        // Never let non-exact synthetic overlaps override an exact open row.
        available.add(boatKey);
      }
      return;
    }

    // Guarded fallback for missing exact rows only.
    const nonOpenOverlaps = rows.filter((r) => {
      if (r.status === "open") return false;
      const sStart = new Date(r.startAt).getTime();
      const eRaw = r.endAt != null && String(r.endAt).trim() !== "" ? new Date(r.endAt).getTime() : NaN;
      const sdur = (parseSlotIdRelaxed(r.id) ?? parseSlotId(r.id))?.durationHours ?? null;
      const sEnd =
        Number.isFinite(eRaw) && !Number.isNaN(eRaw)
          ? eRaw
          : sdur != null && Number.isFinite(sStart)
            ? sStart + sdur * 3600000
            : NaN;
      if (!Number.isFinite(sStart) || !Number.isFinite(sEnd) || sEnd <= sStart) return false;
      return intervalsOverlapMs(selStart, selEnd, sStart, sEnd);
    });

    if (nonOpenOverlaps.length > 0) {
      unavailable.add(boatKey);
      if (nonOpenOverlaps.some((r) => r.status === "booked")) booked.add(boatKey);
      else if (nonOpenOverlaps.some((r) => r.status === "held")) {
        const hasMissingHoldData = nonOpenOverlaps.some((r) => r.status === "held" && r.holdDataMissing === true);
        if (!hasMissingHoldData) held.add(boatKey);
      } else blocked.add(boatKey);
    } else {
      available.add(boatKey);
    }
  });

  return {
    availableBoatIdsForSelectedSlot: available,
    unavailableBoatIdsForSelectedSlot: unavailable,
    bookedBoatIdsForSelectedSlot: booked,
    heldBoatIdsForSelectedSlot: held,
    blockedBoatIdsForSelectedSlot: blocked,
  };
}
