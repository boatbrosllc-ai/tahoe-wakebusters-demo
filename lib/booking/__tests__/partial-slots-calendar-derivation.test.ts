import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boatAvailabilitySetsForSelectedCharterSlot } from "@/lib/booking/partial-slots-calendar-derivation";

describe("boatAvailabilitySetsForSelectedCharterSlot", () => {
  const wakeBoat = "wake-1";

  it("marks boat booked when a shorter trip overlaps the selected longer window (same start)", () => {
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
      {
        id: `${day}-10-8`,
        status: "open",
        startAt: `${day}T15:00:00.000Z`,
        endAt: `${day}T23:00:00.000Z`,
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
});
