import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCaptainTripDays,
  captainGuestNotes,
  captainTripLabel,
  captainTripTimeRange,
  captainWaiverNeedsAttention,
  type CaptainTrip,
} from "../captain-trip";

const trip = (over: Partial<CaptainTrip> = {}): CaptainTrip => ({
  id: "booking-1",
  type: "booking",
  startAt: "2026-08-20T19:00:00.000Z",
  endAt: "2026-08-20T22:00:00.000Z",
  startTime: "2:00 PM",
  endTime: "5:00 PM",
  customer: { name: "Jordan" },
  ...over,
});

describe("captain trip helpers", () => {
  it("labels trips from guest name and formats the time window", () => {
    assert.equal(captainTripLabel(trip()), "Jordan");
    assert.equal(captainTripTimeRange(trip()), "2:00 PM – 5:00 PM");
    assert.equal(captainTripTimeRange(trip({ startTime: null })), "Time TBD");
    assert.equal(addCaptainTripDays("2026-08-20", 6), "2026-08-26");
  });

  it("dedupes guest notes and flags unsigned waivers", () => {
    assert.equal(captainGuestNotes(trip({ specialNotes: "Cooler", guestComments: "cooler" })), "Cooler");
    assert.equal(captainWaiverNeedsAttention("signed"), false);
    assert.equal(captainWaiverNeedsAttention("pending"), true);
    assert.equal(captainWaiverNeedsAttention(undefined), true);
  });
});
