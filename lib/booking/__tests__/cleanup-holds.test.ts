/**
 * Regression: expired holds whose slot was reassigned to another hold must still be
 * finalized (expired) and have shared capacity released, not skipped.
 * See cleanup-holds route: slot.holdId !== doc.id → expire_only path.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { getCleanupHoldSlotAction } from "../cleanup-holds-slot-action";

describe("cleanup-holds replaced slot hold reference", () => {
  it("when slot.holdId matches hold doc id, action is release_slot_and_expire", () => {
    assert.strictEqual(
      getCleanupHoldSlotAction("hold-123", "hold-123"),
      "release_slot_and_expire"
    );
  });

  it("when slot.holdId was replaced with another hold id, action is expire_only so old hold is still finalized", () => {
    assert.strictEqual(
      getCleanupHoldSlotAction("new-hold-456", "old-hold-123"),
      "expire_only"
    );
  });

  it("when slot has no holdId (e.g. already cleared), action is expire_only", () => {
    assert.strictEqual(
      getCleanupHoldSlotAction(undefined, "hold-123"),
      "expire_only"
    );
  });

  it("expire_only ensures cron finalizes old expired hold instead of skipping", () => {
    const action = getCleanupHoldSlotAction("replaced-by-another", "expired-hold-id");
    assert.strictEqual(action, "expire_only", "Replaced slot hold reference must yield expire_only so hold is expired and not skipped");
  });
});
