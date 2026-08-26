import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseGetmyboatMessage, extractGetmyboatBookingId } from "../getmyboat/parse";
import { detectMarketplaceProvider } from "../detector";
import { decideMarketplaceSyncAction } from "../sync-decision";
import { DEFAULT_MARKETPLACE_MAPPINGS, findListingMapping } from "../mapping";
import { toSlotParts } from "../dates";
import type { GmailMessageInput } from "../types";

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), "lib/integrations/marketplaces/__tests__/fixtures", name), "utf8");
}

describe("Getmyboat parser", () => {
  const input: GmailMessageInput = {
    id: "gmb-1",
    threadId: "gmb-thread",
    from: "Getmyboat <noreply@getmyboat.com>",
    fromEmail: "noreply@getmyboat.com",
    subject: "Getmyboat Booking with Guest Name (Wake Surf Boat)",
    text: fixture("getmyboat-confirmation.txt"),
    html: `<a href="https://www.getmyboat.com/inbox/6033474/">View booking</a>`,
  };

  it("extracts the inbox booking id as the stable identifier", () => {
    assert.equal(extractGetmyboatBookingId(input.text ?? "", input.html), "6033474");
  });

  it("parses a confirmed booking", () => {
    const parsed = parseGetmyboatMessage(input);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.event.provider, "getmyboat");
    assert.equal(parsed.event.eventType, "booking_created");
    assert.equal(parsed.event.externalBookingId, "6033474");
    assert.match(parsed.event.externalListingName ?? "", /Axis Wake Surf Boat/i);
    assert.equal(parsed.event.passengerCount, 5);
    assert.equal(parsed.event.durationHours, 4);
    assert.equal(parsed.event.totalCents, 35000);
    assert.ok(parsed.event.startAt);
    const parts = toSlotParts(parsed.event.startAt!, 4);
    assert.deepEqual(parts, { dateStr: "2026-08-23", startHour: 10, startMinute: 0, durationHours: 4 });
    const mapping = findListingMapping(parsed.event, DEFAULT_MARKETPLACE_MAPPINGS);
    assert.equal(mapping?.experienceSlug, "watersports");
    const action = decideMarketplaceSyncAction({
      event: parsed.event,
      existing: null,
      mappings: DEFAULT_MARKETPLACE_MAPPINGS,
      mappedExperienceId: "exp-wake",
      mappedDurationHours: 4,
    });
    assert.equal(action.type, "create");
  });

  it("does not create a duplicate for the same inbox id", () => {
    const parsed = parseGetmyboatMessage(input);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const action = decideMarketplaceSyncAction({
      event: parsed.event,
      existing: { id: "existing", status: "paid" },
      mappings: DEFAULT_MARKETPLACE_MAPPINGS,
      mappedExperienceId: "exp-wake",
      mappedDurationHours: 4,
    });
    assert.equal(action.type, "ignore");
  });

  it("surfaces unknown listings for mapping instead of creating a booking", () => {
    const parsed = parseGetmyboatMessage({
      ...input,
      text: (input.text ?? "").replace("Axis Wake Surf Boat w/ Captain – 14 Guests - Lake Austin", "Mystery Yacht Deluxe"),
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const action = decideMarketplaceSyncAction({
      event: parsed.event,
      existing: null,
      mappings: DEFAULT_MARKETPLACE_MAPPINGS,
    });
    assert.equal(action.type, "needs_mapping");
  });

  it("detects Getmyboat from sender and template", () => {
    assert.equal(detectMarketplaceProvider(input).provider, "getmyboat");
  });

  it("ignores inquiry and reminder emails", () => {
    const parsed = parseGetmyboatMessage({
      ...input,
      subject: "New inquiry for Axis Wake Surf Boat",
      text: "You have a new inquiry. A guest sent a message about your listing.",
      html: `<a href="https://www.getmyboat.com/inbox/6033474/">View booking</a>`,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.event.eventType, "informational");
    const action = decideMarketplaceSyncAction({
      event: parsed.event,
      existing: null,
      mappings: DEFAULT_MARKETPLACE_MAPPINGS,
    });
    assert.equal(action.type, "informational");
  });

  it("does not treat a tracking url as the listing name", () => {
    const parsed = parseGetmyboatMessage({
      ...input,
      text: `Booking Confirmed!

Guest just confirmed payment for Sunday Aug 23 2026 with 5 people.

http://click.getmyboat.com/track/click/8568605/itunes.apple.com?p=abc

Axis Wake Surf Boat w/ Captain – 14 Guests - Lake Austin
`,
      html: `<a href="https://www.getmyboat.com/inbox/6033474/">View booking</a>
<a href="http://click.getmyboat.com/track/click/8568605/itunes.apple.com">boat</a>`,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.match(parsed.event.externalListingName ?? "", /Axis Wake Surf Boat/i);
    assert.equal(parsed.event.externalListingName?.includes("click.getmyboat"), false);
  });

  it("parses Depart as 23 Aug 2026 - 10 AM", () => {
    const parsed = parseGetmyboatMessage({
      ...input,
      text: `Booking Confirmed!
Timothy just confirmed payment for Sunday Aug 23 2026 with 5 people.

Listing: “Axis Wake Surf Boat w/ Captain – 14 Guests - Lake Austin”

Depart
23 Aug 2026 - 10 AM

Return
23 Aug 2026 - 2 PM

Duration
4 hours
`,
      html: `<a href="https://www.getmyboat.com/inbox/6033474/">View booking</a>`,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.match(parsed.event.externalListingName ?? "", /Axis Wake Surf Boat/i);
    assert.ok(parsed.event.startAt);
    const parts = toSlotParts(parsed.event.startAt!, 4);
    assert.deepEqual(parts, { dateStr: "2026-08-23", startHour: 10, startMinute: 0, durationHours: 4 });
  });

  it("reads the guest name from 'X just confirmed payment' when the subject is only Booking Confirmed", () => {
    const parsed = parseGetmyboatMessage({
      ...input,
      subject: "🎉🐬 Booking Confirmed!",
      text: `Booking Confirmed!\n\nTimothy just confirmed payment for Sunday Aug 23 2026 with 5 people.\n\nGet real-time updates\n\n${fixture("getmyboat-payout.txt")}`,
      html: `<a href="https://www.getmyboat.com/inbox/6033474/">View booking</a>`,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.event.customerName, "Timothy");
  });

  it("treats reservation confirmed wording as a new booking", () => {
    const parsed = parseGetmyboatMessage({
      ...input,
      subject: "Reservation confirmed",
      text: `Reservation confirmed

Timothy just confirmed payment for Sunday Aug 23 2026 with 5 people.

Axis Wake Surf Boat w/ Captain – 14 Guests - Lake Austin

Depart
10:00 AM
Sun, Aug 23, 2026
`,
      html: `<a href="https://www.getmyboat.com/inbox/6033474/">View booking</a>`,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.event.eventType, "booking_created");
    assert.equal(parsed.event.externalBookingId, "6033474");
  });

  it("reads Your Payout, renter payments, ice add-on, and cancellation terms", () => {
    const parsed = parseGetmyboatMessage({
      ...input,
      subject: "Getmyboat Booking with Timothy Mattox (Wake Surf Boat)",
      text: fixture("getmyboat-payout.txt"),
      html: `<a href="https://www.getmyboat.com/inbox/6033474/">View booking</a>`,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.event.totalCents, 83190);
    assert.equal(parsed.event.addonSummary, "Ice $40.00");
    assert.match(parsed.event.customerName ?? "", /Timothy Mattox/i);
    assert.match(parsed.event.details?.["Your Payout"] ?? "", /831\.90/);
    assert.match(parsed.event.details?.["Renter Payments"] ?? "", /1,082\.18|1082\.18|108218/);
    assert.equal(parsed.event.details?.Ice, "$40.00");
    assert.match(parsed.event.details?.["Cancellation policy"] ?? "", /50% refund/i);
  });
});
