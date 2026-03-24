/**
 * Regression: partial slots responses (partialData / holdDataMissing) must not dead-end ticketed booking.
 * Assertions use the same derivation helpers as BookingModal and BookingPageClient.
 */
import assert from "node:assert";
import { describe, it } from "node:test";
import {
  type SlotLikeForCalendar,
  openSlotsForDateFromMonthSlots,
  availableDateSetFromMonthSlots,
  availableDateSetFromSlotsWithBoat,
  step2SelectedSlotVerifiedOpen,
} from "../lib/booking/partial-slots-calendar-derivation";

describe("booking partial slots — modal & page progression contracts", () => {
  const ticketedOpenPartialHold: SlotLikeForCalendar = {
    id: "2025-06-15-10-0-3",
    status: "open",
    startAt: "2025-06-15T15:00:00.000Z",
    spotsRemaining: 12,
    holdDataMissing: true,
  };

  it("openSlotsForDate includes ticketed open rows when holdDataMissing is true", () => {
    const rows = openSlotsForDateFromMonthSlots([ticketedOpenPartialHold], "2025-06-15", true);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].id, ticketedOpenPartialHold.id);
  });

  it("availableDateSetFromMonthSlots includes dates with holdDataMissing open ticketed slots", () => {
    const set = availableDateSetFromMonthSlots([ticketedOpenPartialHold], true);
    assert.strictEqual(set.has("2025-06-15"), true);
  });

  it("step2SelectedSlotVerifiedOpen passes under partialData when slot is open (holdDataMissing allowed)", () => {
    const selected = { ...ticketedOpenPartialHold };
    const ok = step2SelectedSlotVerifiedOpen(
      [ticketedOpenPartialHold],
      "2025-06-15",
      selected,
      true,
    );
    assert.strictEqual(ok, true);
    // BookingModal: canGoFromStep2 requires (!slotsPartialData || selectedSlotVerifiedOpen)
    assert.strictEqual(!true || ok, true, "partialData true must still allow continue when verified");
  });

  it("BookingPageClient availableDateSet includes open dates when holdDataMissing is set", () => {
    const set = availableDateSetFromSlotsWithBoat([ticketedOpenPartialHold], null);
    assert(set != null);
    assert.strictEqual(set!.has("2025-06-15"), true);
  });

  it("sold-out ticketed rows stay excluded despite holdDataMissing", () => {
    const sold = {
      ...ticketedOpenPartialHold,
      spotsRemaining: 0,
      holdDataMissing: true,
    };
    const rows = openSlotsForDateFromMonthSlots([sold], "2025-06-15", true);
    assert.strictEqual(rows.length, 0);
    const set = availableDateSetFromMonthSlots([sold], true);
    assert.strictEqual(set.has("2025-06-15"), false);
  });
});
