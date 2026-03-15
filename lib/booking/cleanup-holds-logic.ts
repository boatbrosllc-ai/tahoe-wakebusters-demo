/**
 * Decision logic for cleanup-holds: when an expired hold's slot has been reassigned
 * to another hold (slot.holdId !== holdDocId), we still expire the hold and release
 * shared capacity instead of skipping. This prevents stale active holds and repeated cron work.
 */

/**
 * Returns the action for an expired hold given the slot's current holdId.
 * - release_slot_and_expire: slot still references this hold → clear slot and expire hold.
 * - expire_only: slot was reassigned or missing → only expire hold (and release shared capacity in caller).
 */
export function getCleanupHoldSlotAction(
  slotHoldId: string | undefined,
  holdDocId: string
): "release_slot_and_expire" | "expire_only" {
  if (slotHoldId === holdDocId) return "release_slot_and_expire";
  return "expire_only";
}
