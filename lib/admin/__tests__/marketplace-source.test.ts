import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bookingExpectsWebsiteGuestConfirmation,
  financialChannelFromBooking,
  isMarketplaceBookingSource,
  marketplaceFieldsFromAdminSource,
  normalizeMarketplaceSource,
  resolveMarketplaceSource,
} from "../marketplace-source";

describe("marketplace source", () => {
  it("normalizes common labels", () => {
    assert.equal(normalizeMarketplaceSource("Boatsetter"), "boatsetter");
    assert.equal(normalizeMarketplaceSource("GetMyBoat"), "getmyboat");
    assert.equal(normalizeMarketplaceSource("get my boat"), "getmyboat");
    assert.equal(normalizeMarketplaceSource("Viator"), "viator");
    assert.equal(normalizeMarketplaceSource("Phone"), null);
  });

  it("prefers externalProvider over notes", () => {
    const style = resolveMarketplaceSource({
      source: "admin",
      externalProvider: "viator",
      specialNotes: "boatsetter leftover",
    });
    assert.equal(style?.id, "viator");
  });

  it("falls back to special notes for older manual bookings", () => {
    const style = resolveMarketplaceSource({ specialNotes: "GetMyBoat — Ref: 6033474" });
    assert.equal(style?.id, "getmyboat");
  });

  it("maps bookings onto financials channels", () => {
    assert.equal(financialChannelFromBooking({ source: "website" }), "direct");
    assert.equal(financialChannelFromBooking({ source: "admin" }), "direct");
    assert.equal(financialChannelFromBooking({ source: "viator" }), "viator");
    assert.equal(
      financialChannelFromBooking({ source: "admin", externalProvider: "boatsetter" }),
      "boatsetter"
    );
  });

  it("detects marketplace from externalKey, synthetic email, and fuzzy source labels", () => {
    assert.equal(financialChannelFromBooking({ externalKey: "boatsetter:6033474" }), "boatsetter");
    assert.equal(
      financialChannelFromBooking({
        customer: { email: "marketplace+viator-abc@noreply.example.com" },
      }),
      "viator"
    );
    assert.equal(financialChannelFromBooking({ source: "Boatsetter.com" }), "boatsetter");
    assert.equal(
      financialChannelFromBooking({ marketplaceEmailExcerpt: "GetMyBoat Booking Confirmed!\nYour Payout $350.00" }),
      "getmyboat"
    );
  });

  it("does not expect a website confirmation email for marketplace bookings", () => {
    assert.equal(isMarketplaceBookingSource({ source: "boatsetter" }), true);
    assert.equal(isMarketplaceBookingSource({ externalProvider: "getmyboat" }), true);
    assert.equal(isMarketplaceBookingSource({ externalKey: "viator:BR-1" }), true);
    assert.equal(isMarketplaceBookingSource({ rateId: "marketplace" }), true);
    assert.equal(isMarketplaceBookingSource({ source: "website" }), false);
    assert.equal(isMarketplaceBookingSource({ source: "admin" }), false);
    assert.equal(isMarketplaceBookingSource({}), false);
    assert.equal(bookingExpectsWebsiteGuestConfirmation({ source: "boatsetter" }), false);
    assert.equal(bookingExpectsWebsiteGuestConfirmation({ source: "website" }), true);
    assert.equal(bookingExpectsWebsiteGuestConfirmation({ source: "admin" }), true);
  });

  it("stores canonical fields from the admin source picker", () => {
    assert.deepEqual(marketplaceFieldsFromAdminSource("GetMyBoat", "6033474"), {
      source: "getmyboat",
      externalProvider: "getmyboat",
      externalBookingId: "6033474",
      externalKey: "getmyboat:6033474",
    });
  });
});
