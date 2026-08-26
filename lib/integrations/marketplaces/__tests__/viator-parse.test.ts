import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseViatorMessage } from "../viator/parse";
import { detectMarketplaceProvider } from "../detector";
import { decideMarketplaceSyncAction } from "../sync-decision";
import { DEFAULT_MARKETPLACE_MAPPINGS, findListingMapping } from "../mapping";
import { toSlotParts } from "../dates";
import type { GmailMessageInput } from "../types";

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), "lib/integrations/marketplaces/__tests__/fixtures", name), "utf8");
}

describe("Viator parser", () => {
  const input: GmailMessageInput = {
    id: "viator-1",
    from: "Viator <booking@t1.viator.com>",
    fromEmail: "booking@t1.viator.com",
    subject: "New Booking for Sat, Aug 15, 2026 (#BR-1437096751)",
    text: fixture("viator-confirmation.txt"),
  };

  it("parses booking reference, product code, and 19:30 start", () => {
    const parsed = parseViatorMessage(input);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.event.provider, "viator");
    assert.equal(parsed.event.eventType, "booking_created");
    assert.equal(parsed.event.externalBookingId, "BR-1437096751");
    assert.equal(parsed.event.externalProductCode, "5610231P1");
    assert.match(parsed.event.externalListingName ?? "", /Lake Austin Sunset Boat Ride/i);
    assert.equal(parsed.event.passengerCount, 2);
    assert.equal(parsed.event.totalCents, 8190);
    assert.equal(parsed.event.customerPhone, "+1 5550100123");
    assert.equal(parsed.event.details?.["Special Requirements"], "No");
    assert.match(parsed.event.details?.["Net Rate"] ?? "", /81\.90/);
    assert.ok(parsed.event.startAt);
    const mapping = findListingMapping(parsed.event, DEFAULT_MARKETPLACE_MAPPINGS);
    assert.equal(mapping?.experienceSlug, "sunset");
    const parts = toSlotParts(parsed.event.startAt!, 2);
    assert.deepEqual(parts, { dateStr: "2026-08-15", startHour: 19, startMinute: 30, durationHours: 2 });
    const action = decideMarketplaceSyncAction({
      event: { ...parsed.event, durationHours: 2 },
      existing: null,
      mappings: DEFAULT_MARKETPLACE_MAPPINGS,
      mappedExperienceId: "exp-sunset",
      mappedDurationHours: 2,
    });
    assert.equal(action.type, "create");
  });

  it("requires duration instead of guessing when the experience has none", () => {
    const parsed = parseViatorMessage(input);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const action = decideMarketplaceSyncAction({
      event: parsed.event,
      existing: null,
      mappings: [
        {
          provider: "viator",
          matchType: "product_code",
          matchValue: "5610231p1",
          experienceSlug: "sunset",
        },
      ],
      mappedExperienceId: "exp-sunset",
      mappedDurationHours: null,
    });
    assert.equal(action.type, "needs_review");
    if (action.type === "needs_review") assert.equal(action.reason, "missing_duration");
  });

  it("does not duplicate the same booking reference", () => {
    const parsed = parseViatorMessage(input);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const action = decideMarketplaceSyncAction({
      event: { ...parsed.event, durationHours: 2 },
      existing: { id: "b1", status: "paid" },
      mappings: DEFAULT_MARKETPLACE_MAPPINGS,
      mappedExperienceId: "exp-sunset",
      mappedDurationHours: 2,
    });
    assert.equal(action.type, "ignore");
  });

  it("surfaces unknown products for mapping", () => {
    const parsed = parseViatorMessage({
      ...input,
      text: (input.text ?? "").replaceAll("5610231P1", "9999999P9").replaceAll("Lake Austin Sunset Boat Ride", "Unknown Tour"),
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

  it("detects Viator from booking@t1.viator.com", () => {
    assert.equal(detectMarketplaceProvider(input).provider, "viator");
  });

  it("still maps sunset when the product code and tour grade are missing", () => {
    const parsed = parseViatorMessage({
      ...input,
      text: `New Booking for Sat, Aug 15, 2026 (#BR-1437096751)

You have a new reservation for Lake Austin Sunset Boat Ride.

Booking Reference: BR-1437096751

Tour Name:
Lake Austin Sunset Boat Ride

Travel Date:
Sat, Aug 15, 2026
`,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.event.externalListingName?.includes("Sunset"), true);
    assert.ok(parsed.event.startAt);
    const mapping = findListingMapping(parsed.event, DEFAULT_MARKETPLACE_MAPPINGS);
    assert.equal(mapping?.experienceSlug, "sunset");
    assert.equal(mapping?.durationHours, 2);
    const parts = toSlotParts(parsed.event.startAt!, 2);
    assert.deepEqual(parts, { dateStr: "2026-08-15", startHour: 19, startMinute: 30, durationHours: 2 });
  });

  it("reads a cancel reference when it is written as #BR-", () => {
    const parsed = parseViatorMessage({
      ...input,
      subject: "Cancelled Booking: Thu, Aug 20, 2026",
      text: `Booking Canceled

Booking Details

Booking Reference: #BR-1427710605

Travel Date: Thu, Aug 20, 2026
`,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.event.eventType, "booking_cancelled");
    assert.equal(parsed.event.externalBookingId, "BR-1427710605");
  });

  it("treats reservation confirmed wording as a new booking", () => {
    const parsed = parseViatorMessage({
      ...input,
      subject: "Reservation confirmed for Sat, Aug 15, 2026 (#BR-1437096751)",
      text: `Reservation confirmed

You have a confirmed booking for Lake Austin Sunset Boat Ride.

Booking Reference: BR-1437096751
Tour Name: Lake Austin Sunset Boat Ride
Travel Date: Sat, Aug 15, 2026
Product Code: 5610231P1
Tour Grade Code: TG1~19:30
`,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.event.eventType, "booking_created");
    assert.equal(parsed.event.externalBookingId, "BR-1437096751");
  });

  it("does not take travel date from the fast approaching sentence", () => {
    const parsed = parseViatorMessage({
      ...input,
      text: `Please note the travel date (Sat, Aug 15, 2026) is fast approaching.

Booking Reference: BR-1437096751
Tour Name: Lake Austin Sunset Boat Ride
Travel Date: Sat, Aug 15, 2026
Product Code: 5610231P1
Tour Grade: Lake Austin Sunset Boat Ride 19:30
Tour Grade Code: TG1~19:30
`,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.ok(parsed.event.startAt);
    const parts = toSlotParts(parsed.event.startAt!, 2);
    assert.deepEqual(parts, { dateStr: "2026-08-15", startHour: 19, startMinute: 30, durationHours: 2 });
  });

  it("parses a booking-amended email and updates the existing booking", () => {
    const amended: GmailMessageInput = {
      id: "viator-amended-1",
      from: "Viator <booking@t1.viator.com>",
      fromEmail: "booking@t1.viator.com",
      subject: "No action is required. This booking has been amended.",
      text: fixture("viator-amendment.txt"),
    };
    const parsed = parseViatorMessage(amended);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.event.eventType, "booking_updated");
    assert.equal(parsed.event.externalBookingId, "BR-1439297659");
    assert.equal(parsed.event.externalProductCode, "5610231P1");
    assert.equal(parsed.event.customerName, "Kelly Schernik");
    assert.equal(parsed.event.customerPhone, "+1 5129860788");
    assert.match(parsed.event.externalListingName ?? "", /Lake Austin Sunset Boat Ride/i);
    assert.match(parsed.event.details?.Amendment ?? "", /Dawn Bennett/i);
    assert.equal(parsed.event.details?.["Special Requirements"], "No");
    assert.ok(parsed.event.startAt);
    const mapping = findListingMapping(parsed.event, DEFAULT_MARKETPLACE_MAPPINGS);
    assert.equal(mapping?.experienceSlug, "sunset");
    const parts = toSlotParts(parsed.event.startAt!, 2);
    assert.deepEqual(parts, { dateStr: "2026-08-29", startHour: 19, startMinute: 30, durationHours: 2 });
    const action = decideMarketplaceSyncAction({
      event: { ...parsed.event, durationHours: 2 },
      existing: {
        id: "b-existing",
        status: "paid",
        slotId: "2026-08-29-19-30-2",
        partySize: 2,
        experienceId: "exp-sunset",
      },
      mappings: DEFAULT_MARKETPLACE_MAPPINGS,
      mappedExperienceId: "exp-sunset",
      mappedDurationHours: 2,
    });
    assert.equal(action.type, "update");
  });

  it("classifies Booking Amended from the body when the subject is generic", () => {
    const parsed = parseViatorMessage({
      ...input,
      subject: "Lake Austin Sunset Boat Ride (#BR-1439297659)",
      text: fixture("viator-amendment.txt"),
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.event.eventType, "booking_updated");
    assert.equal(parsed.event.externalBookingId, "BR-1439297659");
  });
});
