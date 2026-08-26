import { describe, it } from "node:test";
import assert from "node:assert";
import { decideMarketplaceSyncAction } from "../sync-decision";
import { DEFAULT_MARKETPLACE_MAPPINGS } from "../mapping";
import { buildExternalKey } from "../types";
import { buildSlotId } from "@/lib/booking/experience-slots";
import { toSlotParts } from "../dates";

describe("marketplace occupancy side effects (decision + slot ids)", () => {
  const occupancy = new Map<string, string>();

  function apply(action: string, slotId: string, bookingId: string) {
    if (action === "create" || action === "update") occupancy.set(slotId, bookingId);
    if (action === "cancel") {
      for (const [k, v] of Array.from(occupancy.entries())) if (v === bookingId) occupancy.delete(k);
    }
    if (action === "update") {
      for (const [k, v] of Array.from(occupancy.entries())) if (v === bookingId && k !== slotId) occupancy.delete(k);
      occupancy.set(slotId, bookingId);
    }
  }

  it("blocks availability on create, ignores duplicates, and releases on cancel", () => {
    const start = new Date("2026-08-21T16:00:00.000Z");
    const parts = toSlotParts(start, 4);
    assert.ok(parts);
    const slotId = buildSlotId(parts!.dateStr, parts!.startHour, parts!.durationHours, parts!.startMinute);
    const created = decideMarketplaceSyncAction({
      event: {
        provider: "boatsetter",
        eventType: "booking_created",
        externalBookingId: "ggwzkpq",
        startAt: start,
        durationHours: 4,
        sourceMessageId: "m1",
      },
      existing: null,
      mappings: DEFAULT_MARKETPLACE_MAPPINGS,
      mappedExperienceId: "watersports",
      mappedDurationHours: 4,
    });
    assert.equal(created.type, "create");
    apply("create", slotId, "b1");
    assert.equal(occupancy.get(slotId), "b1");

    const dup = decideMarketplaceSyncAction({
      event: {
        provider: "boatsetter",
        eventType: "booking_created",
        externalBookingId: "ggwzkpq",
        startAt: start,
        durationHours: 4,
        sourceMessageId: "m1-dup",
      },
      existing: { id: "b1", status: "paid" },
      mappings: DEFAULT_MARKETPLACE_MAPPINGS,
      mappedExperienceId: "watersports",
      mappedDurationHours: 4,
    });
    assert.equal(dup.type, "ignore");
    assert.equal(occupancy.size, 1);

    const cancelled = decideMarketplaceSyncAction({
      event: {
        provider: "boatsetter",
        eventType: "booking_cancelled",
        externalBookingId: "ggwzkpq",
        sourceMessageId: "m2",
      },
      existing: { id: "b1", status: "paid" },
      mappings: DEFAULT_MARKETPLACE_MAPPINGS,
    });
    assert.equal(cancelled.type, "cancel");
    apply("cancel", slotId, "b1");
    assert.equal(occupancy.size, 0);
  });

  it("moves occupancy on modification", () => {
    occupancy.clear();
    occupancy.set("2026-08-21-11-4", "b1");
    const start = new Date("2026-08-22T18:00:00.000Z");
    const parts = toSlotParts(start, 4);
    assert.ok(parts);
    const newSlot = buildSlotId(parts!.dateStr, parts!.startHour, parts!.durationHours, parts!.startMinute);
    const updated = decideMarketplaceSyncAction({
      event: {
        provider: "boatsetter",
        eventType: "booking_updated",
        externalBookingId: "ggwzkpq",
        startAt: start,
        durationHours: 4,
        sourceMessageId: "m3",
      },
      existing: { id: "b1", status: "paid" },
      mappings: DEFAULT_MARKETPLACE_MAPPINGS,
      mappedExperienceId: "watersports",
      mappedDurationHours: 4,
    });
    assert.equal(updated.type, "update");
    apply("update", newSlot, "b1");
    assert.equal(occupancy.has("2026-08-21-11-4"), false);
    assert.equal(occupancy.get(newSlot), "b1");
  });

  it("uses provider + external id as the unique key", () => {
    assert.equal(buildExternalKey("boatsetter", "ggwzkpq"), "boatsetter:ggwzkpq");
    assert.equal(buildExternalKey("getmyboat", "6033474"), "getmyboat:6033474");
    assert.equal(buildExternalKey("viator", "BR-1437096751"), "viator:br-1437096751");
  });

  it("still updates the booking when an amendment only changes guest details", () => {
    const start = new Date("2026-08-21T16:00:00.000Z");
    const parts = toSlotParts(start, 4);
    assert.ok(parts);
    const slotId = buildSlotId(parts!.dateStr, parts!.startHour, parts!.durationHours, parts!.startMinute);
    const sameSlot = decideMarketplaceSyncAction({
      event: {
        provider: "boatsetter",
        eventType: "booking_updated",
        externalBookingId: "ggwzkpq",
        startAt: start,
        durationHours: 4,
        passengerCount: 6,
        customerName: "Dawn Bennett",
        sourceMessageId: "m-mod-name",
      },
      existing: { id: "b1", status: "paid", slotId, partySize: 6, experienceId: "watersports" },
      mappings: DEFAULT_MARKETPLACE_MAPPINGS,
      mappedExperienceId: "watersports",
      mappedDurationHours: 4,
    });
    assert.equal(sameSlot.type, "update");

    const partyChanged = decideMarketplaceSyncAction({
      event: {
        provider: "boatsetter",
        eventType: "booking_updated",
        externalBookingId: "ggwzkpq",
        startAt: start,
        durationHours: 4,
        passengerCount: 8,
        sourceMessageId: "m-mod-party",
      },
      existing: { id: "b1", status: "paid", slotId, partySize: 6, experienceId: "watersports" },
      mappings: DEFAULT_MARKETPLACE_MAPPINGS,
      mappedExperienceId: "watersports",
      mappedDurationHours: 4,
    });
    assert.equal(partyChanged.type, "update");
  });
});
