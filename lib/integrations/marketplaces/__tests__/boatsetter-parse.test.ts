import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBoatsetterMessage } from "../boatsetter/parse";
import { detectMarketplaceProvider } from "../detector";
import { decideMarketplaceSyncAction } from "../sync-decision";
import { DEFAULT_MARKETPLACE_MAPPINGS, findListingMapping } from "../mapping";
import { toSlotParts } from "../dates";
import type { GmailMessageInput } from "../types";

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), "lib/integrations/marketplaces/__tests__/fixtures", name), "utf8");
}

function msg(partial: Partial<GmailMessageInput> & { text: string }): GmailMessageInput {
  return {
    id: partial.id ?? "msg-1",
    from: partial.from ?? "Boatsetter <boatsetter@mail.boatsetter.com>",
    fromEmail: partial.fromEmail ?? "boatsetter@mail.boatsetter.com",
    subject: partial.subject ?? "",
    text: partial.text,
    html: partial.html,
    threadId: partial.threadId ?? "thread-1",
  };
}

describe("Boatsetter parser", () => {
  it("parses the exact Instant Booking example as a new booking", () => {
    const parsed = parseBoatsetterMessage(
      msg({
        subject: "You have a new Instant Booking for Aug 21, 2026 • 11:00 AM.",
        text: fixture("boatsetter-confirmation.txt"),
      })
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.event.provider, "boatsetter");
    assert.equal(parsed.event.eventType, "booking_created");
    assert.equal(parsed.event.externalBookingId, "ggwzkpq");
    assert.match(parsed.event.externalListingName ?? "", /AXIS WAKE RESEARCH A24/i);
    assert.equal(parsed.event.customerName, "paula");
    assert.equal(parsed.event.customerEmail, undefined);
    assert.equal(parsed.event.passengerCount, 9);
    assert.equal(parsed.event.durationHours, 4);
    assert.equal(parsed.event.totalCents, 46462);
    assert.ok(parsed.event.startAt);
    assert.ok(parsed.event.endAt);
    const parts = toSlotParts(parsed.event.startAt!, parsed.event.durationHours!);
    assert.deepEqual(parts, { dateStr: "2026-08-21", startHour: 11, startMinute: 0, durationHours: 4 });
    const mapping = findListingMapping(parsed.event, DEFAULT_MARKETPLACE_MAPPINGS);
    assert.equal(mapping?.experienceSlug, "watersports");
  });

  it("creates a booking from a confirmed Boatsetter email that is not labeled Instant Book", () => {
    const parsed = parseBoatsetterMessage(
      msg({
        subject: "You have a new booking for Aug 21, 2026 • 11:00 AM.",
        text: `You received a booking for Aug 21, 2026 • 11:00 AM.

Booking ID: ggwzkpq

AXIS WAKE RESEARCH A24 W/TRAILER

Renter: paula

Location
Austin, TX

Start
Aug 21, 2026 • 11:00 AM

End
Aug 21, 2026 • 3:00 PM

Duration
4 hours

Passengers
9
`,
      })
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.event.eventType, "booking_created");
    assert.equal(parsed.event.externalBookingId, "ggwzkpq");
    const action = decideMarketplaceSyncAction({
      event: parsed.event,
      existing: null,
      mappings: DEFAULT_MARKETPLACE_MAPPINGS,
      mappedExperienceId: "exp-wake",
      mappedDurationHours: 4,
    });
    assert.equal(action.type, "create");
  });

  it("creates a booking from Booking ID + Start/End when the subject is only approved", () => {
    const parsed = parseBoatsetterMessage(
      msg({
        subject: "Your booking was approved",
        text: `Your booking was approved.

Booking ID: dqcjmdb

MERCURY 150L VERADO 4-STROKE

Renter: Guest

Start
Sep 26, 2026 • 12:30 PM

End
Sep 26, 2026 • 4:30 PM

Duration
4 hours
`,
      })
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.event.eventType, "booking_created");
    assert.equal(parsed.event.externalBookingId, "dqcjmdb");
  });

  it("treats a second confirmation as a duplicate, not a new booking", () => {
    const parsed = parseBoatsetterMessage(
      msg({
        id: "msg-dup",
        subject: "You have a new Instant Booking for Aug 21, 2026 • 11:00 AM.",
        text: fixture("boatsetter-confirmation.txt"),
      })
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const action = decideMarketplaceSyncAction({
      event: parsed.event,
      existing: { id: "booking-1", status: "paid" },
      mappings: DEFAULT_MARKETPLACE_MAPPINGS,
      mappedExperienceId: "exp-wake",
      mappedDurationHours: 4,
    });
    assert.equal(action.type, "ignore");
    if (action.type === "ignore") assert.equal(action.reason, "duplicate_external_booking");
  });

  it("ignores reminder emails for booking creation", () => {
    const parsed = parseBoatsetterMessage(
      msg({
        subject: "Prepare your boat for your Aug 21, 2026 • 2:00 PM booking",
        text: fixture("boatsetter-reminder.txt"),
      })
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.event.externalBookingId, "tfhncsx");
    assert.equal(parsed.event.eventType, "informational");
    const action = decideMarketplaceSyncAction({
      event: parsed.event,
      existing: null,
      mappings: DEFAULT_MARKETPLACE_MAPPINGS,
    });
    assert.equal(action.type, "informational");
  });

  it("parses cancellation and decides to cancel the existing booking", () => {
    const parsed = parseBoatsetterMessage(
      msg({
        subject: "Scott has canceled their booking fbnltmq for Sep 11, 2026 • 1:00 PM.",
        text: fixture("boatsetter-cancellation.txt"),
      })
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.event.eventType, "booking_cancelled");
    assert.equal(parsed.event.externalBookingId, "fbnltmq");
    const action = decideMarketplaceSyncAction({
      event: parsed.event,
      existing: { id: "booking-cancel", status: "paid" },
      mappings: DEFAULT_MARKETPLACE_MAPPINGS,
    });
    assert.equal(action.type, "cancel");
  });

  it("ignores a cancel when that booking was never imported", () => {
    const parsed = parseBoatsetterMessage(
      msg({
        subject: "Scott has canceled their booking fbnltmq for Sep 11, 2026 • 1:00 PM.",
        text: fixture("boatsetter-cancellation.txt"),
      })
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    const action = decideMarketplaceSyncAction({
      event: parsed.event,
      existing: null,
      mappings: DEFAULT_MARKETPLACE_MAPPINGS,
    });
    assert.equal(action.type, "ignore");
  });

  it("reads mixed-case pontoon listing names instead of the word approved", () => {
    const parsed = parseBoatsetterMessage(
      msg({
        subject: "You have a new Instant Booking for Sep 11, 2026 • 11:00 AM.",
        text: `You received an Instant Booking for Sep 11, 2026 • 11:00 AM.
Get ready to earn $464.62. Instant Book means that this trip is automatically approved.

Booking ID: bpzmzvw

JC and Neptoon Pontoon 266 TriToon

Renter: raquel

Start
Sep 11, 2026 • 11:00 AM

End
Sep 11, 2026 • 2:00 PM
`,
      })
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.match(parsed.event.externalListingName ?? "", /Neptoon Pontoon/i);
    assert.equal(parsed.event.totalCents, 46462);
    assert.equal(findListingMapping(parsed.event, DEFAULT_MARKETPLACE_MAPPINGS)?.experienceSlug, "pontoon");
  });

  it("parses a modification and updates the existing booking", () => {
    const parsed = parseBoatsetterMessage(
      msg({
        subject: "Your booking ggwzkpq has been updated",
        text: fixture("boatsetter-modification.txt"),
      })
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.event.eventType, "booking_updated");
    assert.equal(parsed.event.externalBookingId, "ggwzkpq");
    const parts = toSlotParts(parsed.event.startAt!, parsed.event.durationHours!);
    assert.equal(parts?.dateStr, "2026-08-22");
    assert.equal(parts?.startHour, 13);
    const action = decideMarketplaceSyncAction({
      event: parsed.event,
      existing: { id: "booking-1", status: "paid" },
      mappings: DEFAULT_MARKETPLACE_MAPPINGS,
      mappedExperienceId: "exp-wake",
      mappedDurationHours: 4,
    });
    assert.equal(action.type, "update");
  });

  it("detects Boatsetter from the expected sender", () => {
    const detected = detectMarketplaceProvider(
      msg({
        subject: "You have a new Instant Booking",
        text: fixture("boatsetter-confirmation.txt"),
      })
    );
    assert.equal(detected.provider, "boatsetter");
  });

  it("maps the mercury engine listing to pontoon and rejects mercury as a booking id", () => {
    const parsed = parseBoatsetterMessage(
      msg({
        subject: "You have a new Instant Booking for Sep 26, 2026 • 12:30 PM.",
        text: `You received an Instant Booking for Sep 26, 2026 • 12:30 PM.

Booking ID: dqcjmdb

MERCURY 150L VERADO 4-STROKE

Renter: Guest

Start
Sep 26, 2026 • 12:30 PM

End
Sep 26, 2026 • 4:30 PM

Duration
4 hours
`,
      })
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.event.externalBookingId, "dqcjmdb");
    assert.match(parsed.event.externalListingName ?? "", /MERCURY 150L VERADO/i);
    assert.equal(findListingMapping(parsed.event, DEFAULT_MARKETPLACE_MAPPINGS)?.experienceSlug, "pontoon");
    assert.equal(findListingMapping(parsed.event, DEFAULT_MARKETPLACE_MAPPINGS)?.boatId, "ftpU5JiaXE9zJ5gqJvdt");
  });

  it("reads earnings, policy, and listing fields from a Boatsetter Instant Booking email", () => {
    const parsed = parseBoatsetterMessage(
      msg({
        subject: "You have a new Instant Booking for Sep 11, 2026 • 11:00 AM.",
        text: fixture("boatsetter-earnings.txt"),
      })
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.event.externalBookingId, "bpzmzvw");
    assert.equal(parsed.event.totalCents, 46462);
    assert.equal(parsed.event.passengerCount, 14);
    assert.equal(parsed.event.durationHours, 3);
    assert.equal(parsed.event.customerName, "raquel");
    assert.match(parsed.event.externalListingName ?? "", /Neptoon Pontoon/i);
    assert.equal(parsed.event.details?.Earnings, "$464.62");
    assert.equal(parsed.event.details?.["Cancellation policy"], "strict");
    assert.equal(parsed.event.details?.["Instant Book"], "automatically approved");
    assert.equal(parsed.event.details?.Passengers, "14");
    assert.match(parsed.event.emailExcerpt ?? "", /You earn/);
  });

  it("reads the renter email when Boatsetter included it, not the Boatsetter sender", () => {
    const parsed = parseBoatsetterMessage(
      msg({
        subject: "You have a new Instant Booking for Aug 29, 2026 • 3:00 PM.",
        fromEmail: "boatsetter@mail.boatsetter.com",
        text: `You received an Instant Booking.

Booking ID: xtpkjgm

Renter: Sean

Email: sean@lakeaustin.com

Start
Aug 29, 2026 • 3:00 PM

End
Aug 29, 2026 • 7:00 PM
`,
      })
    );
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.event.customerName, "Sean");
    assert.equal(parsed.event.customerEmail, "sean@lakeaustin.com");
  });

  it("ignores security deposit emails instead of using mercury as the booking id", () => {
    const parsed = parseBoatsetterMessage(
      msg({
        subject: "Breanna's security deposit payment failed!",
        text: `Security deposit payment failed.

Booking ID
MERCURY 150L VERADO 4-STROKE

Renter: Breanna
`,
      })
    );
    assert.equal(parsed.ok, false);
    if (parsed.ok) return;
    assert.equal(parsed.status, "ignored");
  });
});
