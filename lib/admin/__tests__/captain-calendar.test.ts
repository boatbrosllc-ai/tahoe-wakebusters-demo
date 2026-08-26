import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calendarEventHasPricing,
  captainSafeMarketplaceDetails,
  captainSafeNotes,
  filterCalendarEventForRole,
} from "../captain-calendar";

const assignedEvent = {
  type: "booking" as const,
  id: "booking-1",
  pricing: { totalCents: 32000, currency: "usd" },
  customer: { name: "Jordan", email: "jordan@example.com", phone: "5125550100" },
  captainEmail: "alex@example.com",
  assignedCaptain: {
    email: "alex@example.com",
    name: "Alex",
    assignedAt: null,
    assignedBy: "Admin",
  },
  specialNotes: "Birthday — bring Bluetooth. — Earnings: $464.62",
  guestComments: "Please stop at Hula Hut",
  addonsWithNames: [{ addonId: "ice", name: "Bag of ice", qty: 2 }],
  operatorNotes: "Dock at Walsh. Guest bringing a cooler.",
  pickup: {
    title: "Loop 360 Boat Ramp",
    address: "5019 N Capital of Texas Hwy, Austin, TX 78746",
    notes: "Park in the upper lot.",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=Loop+360",
    arrivalInstructions: "Arrive 10–15 minutes early.",
  },
  marketplaceDetails: {
    "Add-ons": "Ice $40",
    "Special Requirements": "Birthday banner",
    Earnings: "$464.62",
    "Your Payout": "$464.62",
  },
  marketplaceEmailExcerpt: "You earn $464.62 this trip.",
};

describe("captain calendar event filter", () => {
  it("leaves operator events unchanged including price", () => {
    const next = filterCalendarEventForRole(assignedEvent, "operator", "va@example.com");
    assert.ok(next);
    assert.equal(calendarEventHasPricing(next!), true);
    assert.equal(next!.customer?.email, "jordan@example.com");
    assert.equal(next!.marketplaceDetails?.Earnings, "$464.62");
  });

  it("hides other captains’ bookings and all blocks", () => {
    assert.equal(filterCalendarEventForRole(assignedEvent, "captain", "other@example.com"), null);
    assert.equal(
      filterCalendarEventForRole({ type: "block", id: "block-1" }, "captain", "alex@example.com"),
      null
    );
  });

  it("keeps assigned trips but strips price and guest email", () => {
    const next = filterCalendarEventForRole(assignedEvent, "captain", "alex@example.com");
    assert.ok(next);
    assert.equal(next!.pricing, undefined);
    assert.equal(calendarEventHasPricing(next!), false);
    assert.equal(next!.customer?.name, "Jordan");
    assert.equal(next!.customer?.phone, "5125550100");
    assert.equal(next!.customer?.email, undefined);
  });

  it("keeps operator notes and the timeline for the assigned captain", () => {
    const next = filterCalendarEventForRole(
      {
        ...assignedEvent,
        operatorNotes: "Dock north side",
        operatorNotesLog: [
          { id: "n1", text: "Dock north side", by: "Admin", at: "2026-08-20T17:00:00.000Z" },
          { id: "n2", text: "Guest running late", by: "Admin", at: "2026-08-20T18:00:00.000Z" },
        ],
      },
      "captain",
      "alex@example.com"
    );
    assert.ok(next);
    assert.equal(next!.operatorNotes, "Dock north side");
    assert.equal((next!.operatorNotesLog as { text: string }[]).length, 2);
  });

  it("keeps pickup, add-ons, and guest notes without payouts", () => {
    const next = filterCalendarEventForRole(assignedEvent, "captain", "alex@example.com");
    assert.ok(next);
    assert.equal((next!.pickup as { title?: string }).title, "Loop 360 Boat Ramp");
    assert.deepEqual(next!.addonsWithNames, [{ addonId: "ice", name: "Bag of ice", qty: 2 }]);
    assert.equal(next!.guestComments, "Please stop at Hula Hut");
    assert.equal(next!.operatorNotes, "Dock at Walsh. Guest bringing a cooler.");
    assert.equal(next!.specialNotes, "Birthday — bring Bluetooth.");
    assert.equal(next!.marketplaceEmailExcerpt, undefined);
    assert.equal((next!.marketplaceDetails as Record<string, string>)["Add-ons"], "Ice $40");
    assert.equal((next!.marketplaceDetails as Record<string, string>)["Special Requirements"], "Birthday banner");
    assert.equal((next!.marketplaceDetails as Record<string, string>).Earnings, undefined);
    assert.equal((next!.marketplaceDetails as Record<string, string>)["Your Payout"], undefined);
  });
});

describe("captain-safe marketplace details and notes", () => {
  it("drops payout labels and keeps operational fields", () => {
    const details = captainSafeMarketplaceDetails({
      Location: "Walsh Boat Ramp",
      Earnings: "$81.90",
      "Net Rate": "$0.00",
      Phone: "5125550100",
    });
    assert.deepEqual(details, { Location: "Walsh Boat Ramp", Phone: "5125550100" });
  });

  it("strips earnings from imported marketplace notes", () => {
    assert.equal(
      captainSafeNotes("boatsetter — Ref: ABC — Add-ons: Ice $40 — Earnings: $464.62"),
      "boatsetter — Ref: ABC — Add-ons: Ice $40"
    );
    assert.equal(captainSafeNotes("Need a cooler on board"), "Need a cooler on board");
  });
});
