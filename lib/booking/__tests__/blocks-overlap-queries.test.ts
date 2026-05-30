import assert from "node:assert";
import { describe, it } from "node:test";
import {
  blockIntervalsOverlapMs,
  blockRowOverlapsSlot,
} from "../blocks-overlap-queries";

describe("blocks-overlap-queries", () => {
  it("blockRowOverlapsSlot matches boat-specific block regardless of experience on doc", () => {
    const slotStart = new Date("2026-07-04T18:00:00.000Z").getTime(); // 1pm Chicago
    const slotEnd = new Date("2026-07-04T21:00:00.000Z").getTime();
    const row = {
      boatId: "Ld5Lj5RCfFvd1ld01P1A",
      startAt: { toDate: () => new Date("2026-07-04T17:00:00.000Z") },
      endAt: { toDate: () => new Date("2026-07-04T22:00:00.000Z") },
    };
    assert.strictEqual(blockRowOverlapsSlot(row, slotStart, slotEnd, "Ld5Lj5RCfFvd1ld01P1A"), true);
  });

  it("blockRowOverlapsSlot ignores other boats", () => {
    const slotStart = new Date("2026-07-04T18:00:00.000Z").getTime();
    const slotEnd = new Date("2026-07-04T21:00:00.000Z").getTime();
    const row = {
      boatId: "other-boat",
      startAt: { toDate: () => new Date("2026-07-04T17:00:00.000Z") },
      endAt: { toDate: () => new Date("2026-07-04T22:00:00.000Z") },
    };
    assert.strictEqual(blockRowOverlapsSlot(row, slotStart, slotEnd, "Ld5Lj5RCfFvd1ld01P1A"), false);
  });

  it("blockIntervalsOverlapMs uses half-open style overlap", () => {
    const a0 = 0;
    const a1 = 100;
    const b0 = 100;
    const b1 = 200;
    assert.strictEqual(blockIntervalsOverlapMs(a0, a1, b0, b1), false);
    assert.strictEqual(blockIntervalsOverlapMs(a0, a1, 50, 150), true);
  });
});
