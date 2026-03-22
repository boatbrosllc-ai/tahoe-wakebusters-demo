/**
 * Decision logic for cleanup-holds: when an expired hold's slot has been reassigned
 * to another hold (slot.holdId !== holdDocId), we still expire the hold and release
 * shared capacity instead of skipping. This prevents stale active holds and repeated cron work.
 */

import type { Firestore, QueryDocumentSnapshot, DocumentData, DocumentReference } from "firebase-admin/firestore";
import { getDepartureInventoryRef, releaseCapacity } from "@/lib/booking/shared-departure-inventory";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { getCleanupHoldSlotAction } from "@/lib/booking/cleanup-holds-slot-action";

export { getCleanupHoldSlotAction };

/**
 * Single canonical transaction for expiring a hold: slot release, shared inventory, discount usedCount.
 * Used by public and admin cleanup-holds cron routes.
 * Re-reads the hold document inside the transaction and only performs release/decrement side effects
 * when transitioning status from active → expired (avoids double-decrement when cleanup races release).
 */
type AdminFieldValue = typeof import("firebase-admin").firestore.FieldValue;

export async function runExpiredHoldReleaseTransaction(
  db: Firestore,
  FieldValue: AdminFieldValue,
  doc: QueryDocumentSnapshot<DocumentData>
): Promise<"processed" | "skipped" | "failed"> {
  const holdRef = doc.ref;

  try {
    let result: "processed" | "skipped" = "skipped";

    await db.runTransaction(async (tx) => {
      const holdSnap = await tx.get(holdRef);
      if (!holdSnap.exists) {
        return;
      }
      const hold = holdSnap.data();
      if (!hold || (hold.status as string | undefined) !== "active") {
        return;
      }

      const boatId = hold.boatId as string | undefined;
      const experienceId = hold.experienceId as string | undefined;
      const slotId = hold.slotId as string;
      if (!slotId || (!boatId && !experienceId)) {
        console.warn("[cleanup-holds] skipped hold missing slotId or boat/experience", { holdId: doc.id });
        return;
      }

      const isSharedHold = (hold as { bookingMode?: string }).bookingMode === "shared";
      const dateStr = (hold as { startDateStr?: string }).startDateStr ?? parseSlotId(slotId)?.dateStr ?? "";
      const slotRef = boatId
        ? db.collection("boats").doc(boatId).collection("slots").doc(slotId)
        : db.collection("experiences").doc(experienceId!).collection("slots").doc(slotId);

      const discountCode = (hold as { discountCode?: string }).discountCode;
      const discountDocId = (hold as { discountDocId?: string }).discountDocId;
      let discountRef: DocumentReference | null = null;
      if (discountDocId) {
        discountRef = db.collection("discounts").doc(discountDocId);
      } else if (discountCode) {
        const discountSnap = await tx.get(db.collection("discounts").where("code", "==", discountCode).limit(1));
        if (!discountSnap.empty) discountRef = discountSnap.docs[0].ref;
      }

      const applyDiscountDecrement = async (ref: DocumentReference | null) => {
        if (!ref) return;
        const dSnap = await tx.get(ref);
        if (dSnap.exists) {
          const d = dSnap.data() as { usedCount?: number };
          const nextCount = Math.max(0, (d.usedCount ?? 0) - 1);
          tx.update(ref, { usedCount: nextCount, updatedAt: FieldValue.serverTimestamp() });
        }
      };

      const slotSnap = await tx.get(slotRef);
      if (!slotSnap.exists) {
        if (isSharedHold && experienceId && dateStr) {
          const inventoryRef = getDepartureInventoryRef(db, experienceId, dateStr);
          await releaseCapacity(tx, inventoryRef, (hold.partySize as number) ?? 0);
        }
        tx.update(holdRef, { status: "expired" });
        await applyDiscountDecrement(discountRef);
        result = "processed";
        return;
      }

      const slot = slotSnap.data();
      const action = getCleanupHoldSlotAction(slot?.holdId as string | undefined, doc.id);
      if (action === "release_slot_and_expire") {
        tx.update(slotRef, {
          status: "open",
          holdId: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (isSharedHold && experienceId && dateStr) {
          const inventoryRef = getDepartureInventoryRef(db, experienceId, dateStr);
          await releaseCapacity(tx, inventoryRef, (hold.partySize as number) ?? 0);
        }
      } else if (isSharedHold && experienceId && dateStr) {
        const inventoryRef = getDepartureInventoryRef(db, experienceId, dateStr);
        await releaseCapacity(tx, inventoryRef, (hold.partySize as number) ?? 0);
      }

      tx.update(holdRef, { status: "expired" });
      await applyDiscountDecrement(discountRef);
      result = "processed";
    });

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cleanup-holds] transaction failed", { holdId: doc.id, error: message }, err);
    return "failed";
  }
}
