/**
 * Shared helpers for checkout session creation and rollback.
 * Used by create-checkout-session and create-checkout-session-direct to avoid duplicating rollback logic.
 */

import type { Firestore } from "firebase-admin/firestore";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { getDepartureInventoryRef, getReservedSeats } from "@/lib/booking/shared-departure-inventory";

export type HoldLike = {
  slotId: string;
  boatId?: string | null;
  experienceId?: string | null;
  partySize?: number | null;
  bookingMode?: string;
};

export type FirestoreExports = {
  FieldValue: import("firebase-admin").firestore.FieldValue;
  Timestamp?: import("firebase-admin").firestore.Timestamp;
};

/**
 * Rollback a checkout session failure: release the slot (and shared-departure capacity when applicable)
 * and mark the hold as expired so the slot/capacity is available again.
 * Best-effort; log errors but do not throw so the caller can surface the original failure.
 */
export async function rollbackCheckoutSession(
  db: Firestore,
  holdId: string,
  hold: HoldLike,
  firestoreExports: FirestoreExports
): Promise<void> {
  const { FieldValue } = firestoreExports;
  const slotRef = hold.boatId
    ? db.collection("boats").doc(hold.boatId).collection("slots").doc(hold.slotId)
    : hold.experienceId
      ? db.collection("experiences").doc(hold.experienceId).collection("slots").doc(hold.slotId)
      : null;
  const bookingMode = hold.bookingMode;
  const isSharedTicketed = bookingMode === "shared" && !!hold.experienceId;
  const parsedSlot = hold.slotId ? parseSlotId(hold.slotId) : null;
  const inventoryRef =
    isSharedTicketed && parsedSlot && hold.experienceId
      ? getDepartureInventoryRef(db, hold.experienceId, parsedSlot.dateStr)
      : null;
  const holdRef = db.collection("holds").doc(holdId);

  try {
    await db.runTransaction(async (tx) => {
      const slotSnap = slotRef ? await tx.get(slotRef) : { exists: false, data: () => null };
      const reservedAfterRelease =
        inventoryRef != null && typeof hold.partySize === "number"
          ? Math.max(0, (await getReservedSeats(tx, inventoryRef)) - hold.partySize)
          : null;
      if (slotRef && slotSnap.exists && (slotSnap.data() as { holdId?: string })?.holdId === holdId) {
        tx.update(slotRef, {
          status: "open",
          holdId: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      if (inventoryRef != null && reservedAfterRelease !== null) {
        tx.set(
          inventoryRef,
          { reservedSeats: reservedAfterRelease, updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
      }
      tx.update(holdRef, { status: "expired" });
    });
  } catch (rollbackErr) {
    console.error("[rollbackCheckoutSession] rollback failed", { holdId, err: rollbackErr });
  }
}
