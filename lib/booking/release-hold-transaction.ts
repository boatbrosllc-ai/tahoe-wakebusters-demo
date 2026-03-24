/**
 * Shared Firestore transaction to expire a hold and free its slot (and shared-departure inventory).
 * Used by POST /api/booking/release-hold and cron/tooling.
 */

import { getDepartureInventoryRef, releaseCapacity } from "@/lib/booking/shared-departure-inventory";
import { parseSlotId } from "@/lib/booking/experience-slots";
import type { Hold, Slot } from "@/lib/booking/types";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";

/**
 * Re-reads the hold inside the transaction and only performs slot/capacity/discount
 * side effects when transitioning status from active → expired (avoids double-decrement
 * when release races cleanup or duplicate release calls).
 */
export async function executeReleaseHoldTransaction(
  db: Firestore,
  holdId: string
): Promise<{ released: true } | { released: false; message: string }> {
  const { FieldValue } = getFirestoreExports();
  const holdRef = db.collection("holds").doc(holdId);

  let outcome: { released: true } | { released: false; message: string } = {
    released: false,
    message: "Hold already released or converted",
  };

  await db.runTransaction(async (tx) => {
    const holdSnap = await tx.get(holdRef);
    if (!holdSnap.exists) {
      outcome = { released: false, message: "Hold not found or already released" };
      return;
    }
    const hold = holdSnap.data() as Hold;
    if (hold.status !== "active") {
      outcome = { released: false, message: "Hold already released or converted" };
      return;
    }

    const experienceId = hold.experienceId as string | undefined;
    const boatId = hold.boatId as string | undefined;
    const slotId = hold.slotId as string;
    if (!slotId || (!experienceId && !boatId)) {
      throw new Error("Invalid hold");
    }

    const slotRef = boatId
      ? db.collection("boats").doc(boatId).collection("slots").doc(slotId)
      : db.collection("experiences").doc(experienceId!).collection("slots").doc(slotId);

    const isSharedHold = (hold as { bookingMode?: string }).bookingMode === "shared";
    const dateStr =
      (hold as { startDateStr?: string }).startDateStr ?? parseSlotId(hold.slotId)?.dateStr ?? "";

    let discountDocRef: DocumentReference | null = null;
    const discountDocId = (hold as { discountDocId?: string }).discountDocId;
    const discountCode = (hold as { discountCode?: string }).discountCode;
    if (discountDocId) {
      discountDocRef = db.collection("discounts").doc(discountDocId);
    } else if (discountCode) {
      const discountSnap = await tx.get(db.collection("discounts").where("code", "==", discountCode).limit(1));
      if (!discountSnap.empty) discountDocRef = discountSnap.docs[0].ref;
    }

    const applyDiscountDecrementTx = async () => {
      if (!discountDocRef) return;
      const dSnap = await tx.get(discountDocRef);
      if (dSnap.exists) {
        const d = dSnap.data() as { usedCount?: number };
        const nextCount = Math.max(0, (d.usedCount ?? 0) - 1);
        tx.update(discountDocRef, { usedCount: nextCount, updatedAt: FieldValue.serverTimestamp() });
      }
    };

    const slotSnap = await tx.get(slotRef);
    if (!slotSnap.exists) {
      if (isSharedHold && experienceId && dateStr) {
        const inventoryRef = getDepartureInventoryRef(db, experienceId, dateStr);
        await releaseCapacity(tx, inventoryRef, hold.partySize);
      }
      tx.update(holdRef, { status: "expired", rollbackPending: FieldValue.delete() });
      await applyDiscountDecrementTx();
      outcome = { released: true };
      return;
    }
    const slot = slotSnap.data() as Slot;
    if (slot.holdId !== holdId) {
      if (isSharedHold && experienceId && dateStr) {
        const inventoryRef = getDepartureInventoryRef(db, experienceId, dateStr);
        await releaseCapacity(tx, inventoryRef, hold.partySize);
      }
      tx.update(holdRef, { status: "expired", rollbackPending: FieldValue.delete() });
      await applyDiscountDecrementTx();
      outcome = { released: true };
      return;
    }
    tx.update(slotRef, {
      status: "open",
      holdId: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (isSharedHold && experienceId && dateStr) {
      const inventoryRef = getDepartureInventoryRef(db, experienceId, dateStr);
      await releaseCapacity(tx, inventoryRef, hold.partySize);
    }
    tx.update(holdRef, { status: "expired", rollbackPending: FieldValue.delete() });
    await applyDiscountDecrementTx();
    outcome = { released: true };
  });

  return outcome;
}
