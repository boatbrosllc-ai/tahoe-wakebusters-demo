import { describe, it } from "node:test";
import assert from "node:assert";
import {
  bookingCardDisplayTime,
  bookingCardDurationHours,
  formatDurationHoursLabel,
  pickCanonicalBookingSlotRow,
} from "../calendar-booking-card";

describe("admin calendar booking card display", () => {
  it("prefers booking summary startTime over overlap grid slot id", () => {
    const slot = {
      id: "2026-05-30-9-4",
      bookingSummary: {
        slotId: "2026-05-30-15-4",
        startTime: "3:00 PM",
        durationHours: 4,
      },
    };
    assert.strictEqual(
      bookingCardDisplayTime(slot, () => "9:00 AM"),
      "3:00 PM"
    );
  });

  it("falls back to slot formatter when summary has no startTime", () => {
    const slot = { id: "2026-05-30-15-4" };
    assert.strictEqual(bookingCardDisplayTime(slot, () => "3:00 PM"), "3:00 PM");
  });

  it("uses summary duration over overlap tier bookingDurationHours", () => {
    const slot = {
      id: "2026-05-30-9-4",
      bookingDurationHours: 4,
      bookingSummary: { durationHours: 4, slotId: "2026-05-30-15-4", startTime: "3:00 PM" },
    };
    assert.strictEqual(bookingCardDurationHours(slot), 4);
    assert.strictEqual(formatDurationHoursLabel(4), "4 hr");
  });

  it("pickCanonicalBookingSlotRow keeps row matching booking slotId", () => {
    const overlap = {
      id: "2026-05-30-9-4",
      bookingSummary: {
        slotId: "2026-05-30-15-4",
        startTime: "3:00 PM",
        durationHours: 4,
      },
    };
    const canonical = {
      id: "2026-05-30-15-4",
      bookingSummary: overlap.bookingSummary,
    };
    assert.strictEqual(pickCanonicalBookingSlotRow(overlap, canonical).id, "2026-05-30-15-4");
    assert.strictEqual(pickCanonicalBookingSlotRow(canonical, overlap).id, "2026-05-30-15-4");
  });
});
