import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boatAvailabilitySetsForSelectedCharterSlot } from "@/lib/booking/partial-slots-calendar-derivation";

describe("boatAvailabilitySetsForSelectedCharterSlot", () => {
  const wakeBoat = "wake-1";

  it("falls back to overlap and marks boat booked only when exact selected row is missing", () => {
    const day = "2026-06-10";
    const selectedEight = {
      id: `${day}-10-8`,
      startAt: `${day}T15:00:00.000Z`,
      endAt: `${day}T23:00:00.000Z`,
    };
    const monthSlots = [
      {
        id: `${day}-10-4`,
        status: "booked",
        startAt: `${day}T15:00:00.000Z`,
        endAt: `${day}T19:00:00.000Z`,
        boatId: wakeBoat,
      },
    ];

    const r = boatAvailabilitySetsForSelectedCharterSlot(monthSlots, selectedEight, false);
    assert.equal(r.availableBoatIdsForSelectedSlot.has(wakeBoat), false);
    assert.equal(r.unavailableBoatIdsForSelectedSlot.has(wakeBoat), true);
    assert.equal(r.bookedBoatIdsForSelectedSlot.has(wakeBoat), true);
  });

  it("keeps boat selectable when only the exact tier row is open and nothing overlaps", () => {
    const day = "2026-06-11";
    const selected = {
      id: `${day}-10-8`,
      startAt: `${day}T15:00:00.000Z`,
      endAt: `${day}T23:00:00.000Z`,
    };
    const monthSlots = [
      {
        id: `${day}-10-8`,
        status: "open",
        startAt: `${day}T15:00:00.000Z`,
        endAt: `${day}T23:00:00.000Z`,
        boatId: wakeBoat,
      },
    ];
    const r = boatAvailabilitySetsForSelectedCharterSlot(monthSlots, selected, false);
    assert.equal(r.availableBoatIdsForSelectedSlot.has(wakeBoat), true);
    assert.equal(r.unavailableBoatIdsForSelectedSlot.has(wakeBoat), false);
  });

  it("keeps later selected slot available when exact row is open despite synthetic overlapping booked row", () => {
    const day = "2026-06-12";
    const selectedLater = {
      id: `${day}-12-8`,
      startAt: `${day}T19:00:00.000Z`,
      endAt: `2026-06-13T03:00:00.000Z`,
    };
    const monthSlots = [
      // Real short booking that ends exactly at the later slot start.
      {
        id: `${day}-10-4`,
        status: "booked",
        startAt: `${day}T15:00:00.000Z`,
        endAt: `${day}T19:00:00.000Z`,
        boatId: wakeBoat,
      },
      // Synthetic conflict-expanded row from API overlap handling.
      {
        id: `${day}-10-8`,
        status: "booked",
        startAt: `${day}T15:00:00.000Z`,
        endAt: `${day}T23:00:00.000Z`,
        boatId: wakeBoat,
      },
      // Exact selected row remains open and should be authoritative.
      {
        id: `${day}-12-8`,
        status: "open",
        startAt: `${day}T19:00:00.000Z`,
        endAt: `2026-06-13T03:00:00.000Z`,
        boatId: wakeBoat,
      },
    ];

    const r = boatAvailabilitySetsForSelectedCharterSlot(monthSlots, selectedLater, false);
    assert.equal(r.availableBoatIdsForSelectedSlot.has(wakeBoat), true);
    assert.equal(r.unavailableBoatIdsForSelectedSlot.has(wakeBoat), false);
    assert.equal(r.bookedBoatIdsForSelectedSlot.has(wakeBoat), false);
  });
});
