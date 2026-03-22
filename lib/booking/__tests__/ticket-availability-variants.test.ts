/**
 * Unit test: ticket-availability counts bookings stored under a slug alias.
 * When experience is requested by doc id (e.g. exp-sunset) and the experience has slug "sunset",
 * getExperienceIdVariants includes "sunset-cruise"; bookings with experienceId "sunset-cruise"
 * must be included in the sold count (deduplicated by doc id).
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { getExperienceIdVariants } from "../experience-aliases";
import { BOOKING_STATUSES_SLOT_TAKEN } from "../types";
import { parseSlotId } from "../experience-slots";

describe("ticket-availability variant expansion", () => {
  it("getExperienceIdVariants includes slug alias so bookings under alias are counted", () => {
    const docId = "exp-sunset-1";
    const slug = "sunset";
    const variants = getExperienceIdVariants(docId, slug);
    assert.ok(variants.includes("sunset-cruise"), "sunset family must include sunset-cruise so bookings stored under that alias are found");
    assert.ok(variants.includes(docId));
  });

  it("merge-and-count logic counts a single booking stored under slug alias once", () => {
    const date = "2025-06-01";
    const slotId = `${date}-19-0-2`;
    const parsed = parseSlotId(slotId);
    assert.ok(parsed && parsed.dateStr === date);

    // Simulate two query snaps: one for doc id (empty), one for alias (one booking)
    type DocLike = { id: string; data: () => { slotId?: string; partySize?: number; status?: string } };
    const snapFromDocId: { docs: DocLike[] } = { docs: [] };
    const snapFromAlias: { docs: DocLike[] } = {
      docs: [
        {
          id: "booking-1",
          data: () => ({ slotId, partySize: 2, status: "paid" }),
        },
      ],
    };
    const bookingsSnaps = [snapFromDocId, snapFromAlias];

    const seenBookingIds = new Set<string>();
    let sold = 0;
    for (const snap of bookingsSnaps) {
      for (const doc of snap.docs) {
        if (seenBookingIds.has(doc.id)) continue;
        seenBookingIds.add(doc.id);
        const b = doc.data();
        if (!b.slotId || typeof b.partySize !== "number") continue;
        if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
        const p = parseSlotId(b.slotId);
        if (!p || p.dateStr !== date) continue;
        sold += b.partySize;
      }
    }
    assert.strictEqual(sold, 2, "booking stored under slug alias must be counted in sold total");
  });
});
