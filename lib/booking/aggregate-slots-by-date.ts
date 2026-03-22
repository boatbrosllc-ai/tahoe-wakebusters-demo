import { isoToChicagoDateStr } from "@/lib/booking/format-booking-datetime";

export type SlotDayCounts = { open: number; held: number; booked: number; blocked: number };

type SlotLike = {
  id: string;
  startAt: string;
  status: string;
  boatId?: string;
  bookingId?: string | null;
  spotsRemaining?: number;
};

/**
 * Per-day slot tallies for calendar UI. Booked rows are deduped by `bookingId` per day so a single
 * charter booking that fans out to every boat (missing boatId on the server) does not read as N bookings.
 */
export function aggregateSlotsByDate(slots: SlotLike[], isTicketed: boolean): Map<string, SlotDayCounts> {
  const map = new Map<string, SlotDayCounts>();
  const bookedSeen = new Map<string, Set<string>>();

  for (const s of slots) {
    const day = isoToChicagoDateStr(s.startAt);
    if (!map.has(day)) map.set(day, { open: 0, held: 0, booked: 0, blocked: 0 });
    const e = map.get(day)!;

    if (s.status === "open") {
      const soldOut = isTicketed && typeof s.spotsRemaining === "number" && s.spotsRemaining === 0;
      if (!soldOut) e.open++;
    } else if (s.status === "held") {
      e.held++;
    } else if (s.status === "booked") {
      const dedupeKey =
        s.bookingId != null && String(s.bookingId).trim() !== ""
          ? `bid:${String(s.bookingId).trim()}`
          : `row:${s.boatId ?? ""}:${s.id}`;
      if (!bookedSeen.has(day)) bookedSeen.set(day, new Set());
      const set = bookedSeen.get(day)!;
      if (set.has(dedupeKey)) continue;
      set.add(dedupeKey);
      e.booked++;
    } else {
      e.blocked++;
    }
  }

  return map;
}
