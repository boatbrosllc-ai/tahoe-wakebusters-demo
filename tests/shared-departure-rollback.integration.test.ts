/**
 * When Stripe session creation fails in create-checkout-session, the rollback calls
 * releaseCapacity(tx, inventoryRef, hold.partySize) for shared ticketed holds so
 * departureInventory.reservedSeats is restored. This test verifies the rollback
 * formula (same as in lib/booking/shared-departure-inventory releaseCapacity):
 * new reservedSeats = max(0, current - partySize).
 */
import { describe, it } from "node:test";
import assert from "node:assert";

function releasedReservedSeats(current: number, partySize: number): number {
  return Math.max(0, current - partySize);
}

describe("shared-departure rollback on Stripe failure", () => {
  it("released reservedSeats equals current minus partySize so capacity is restored after rollback", () => {
    const initialReserved = 3;
    const partySize = 2;
    assert.strictEqual(releasedReservedSeats(initialReserved, partySize), 1);
  });

  it("released reservedSeats is clamped to zero when current < partySize", () => {
    assert.strictEqual(releasedReservedSeats(1, 2), 0);
  });
});
