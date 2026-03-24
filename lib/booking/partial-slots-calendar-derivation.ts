import { isoToChicagoDateStr } from "@/lib/booking/format-booking-datetime";

/** Minimal slot shape for calendar open-date / open-slot derivation (modal + booking page). */
export type SlotLikeForCalendar = {
  id: string;
  status: string;
  startAt: string;
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
    if (selectedBoat && slot.boatId && slot.boatId !== selectedBoat.id) continue;
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
