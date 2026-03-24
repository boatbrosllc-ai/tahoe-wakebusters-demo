/**
 * Decision logic for cleanup-holds: when an expired hold's slot has been reassigned
 * to another hold (slot.holdId !== holdDocId), we still expire the hold and release
 * shared capacity instead of skipping. This prevents stale active holds and repeated cron work.
 *
 * Parallel cron invocations are serialized by a Firestore lock (`cron/cleanup-holds-lock`); see
 * `lib/booking/cleanup-holds-lock.ts` and the cleanup-holds API routes.
 */

import type { Firestore, DocumentReference } from "firebase-admin/firestore";
import { getDepartureInventoryRef, releaseCapacity } from "@/lib/booking/shared-departure-inventory";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { getCleanupHoldSlotAction } from "@/lib/booking/cleanup-holds-slot-action";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";

export { getCleanupHoldSlotAction };

/**
 * Single canonical transaction for expiring a hold: slot release, shared inventory, discount usedCount.
 * Used by public and admin cleanup-holds cron routes.
 * Pass a hold `DocumentReference` only — all reads happen inside the transaction (no pre-transaction hold snapshot).
 * Re-reads the hold document inside the transaction and only performs release/decrement side effects
 * when transitioning status from active → expired (avoids double-decrement when cleanup races release).
 */
type AdminFieldValue = typeof import("firebase-admin").firestore.FieldValue;

export async function runExpiredHoldReleaseTransaction(
  db: Firestore,
  FieldValue: AdminFieldValue,
  holdRef: DocumentReference
): Promise<"processed" | "skipped" | "failed"> {
  try {
    let result: "processed" | "skipped" = "skipped";
    /** Firestore callback assignments are not flow-narrowed on `let`; use a mutable ref for TS + runtime. */
    const paymentIntentCleanupDeferAlert = { holdId: null as string | null };

    await db.runTransaction(async (tx) => {
      const holdSnap = await tx.get(holdRef);
      if (!holdSnap.exists) {
        return;
      }
      const hold = holdSnap.data();
      if (!hold || (hold.status as string | undefined) !== "active") {
        return;
      }

      const fullPi = (hold as { fullPaymentIntentId?: string }).fullPaymentIntentId;
      const depPi = (hold as { depositPaymentIntentId?: string }).depositPaymentIntentId;
      const hasPaymentIntentRecorded =
        (typeof fullPi === "string" && fullPi.trim().length > 0) ||
        (typeof depPi === "string" && depPi.trim().length > 0);
      const expiresAtRaw = (hold as { expiresAt?: { toDate?: () => Date } }).expiresAt;
      const expiresAtDate = expiresAtRaw?.toDate?.();
      if (hasPaymentIntentRecorded && expiresAtDate && expiresAtDate.getTime() < Date.now()) {
        const alreadyFlagged = (hold as { rollbackPending?: boolean }).rollbackPending === true;
        tx.update(holdRef, {
          rollbackPending: true,
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (!alreadyFlagged) {
          paymentIntentCleanupDeferAlert.holdId = holdRef.id;
        }
        result = "processed";
        return;
      }

      const boatId = hold.boatId as string | undefined;
      const experienceId = hold.experienceId as string | undefined;
      const slotId = hold.slotId as string;
      if (!slotId || (!boatId && !experienceId)) {
        console.warn("[cleanup-holds] skipped hold missing slotId or boat/experience", { holdId: holdRef.id });
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
        tx.update(holdRef, { status: "expired", rollbackPending: FieldValue.delete() });
        await applyDiscountDecrement(discountRef);
        result = "processed";
        return;
      }

      const slot = slotSnap.data();
      const action = getCleanupHoldSlotAction(slot?.holdId as string | undefined, holdRef.id);
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

      tx.update(holdRef, { status: "expired", rollbackPending: FieldValue.delete() });
      await applyDiscountDecrement(discountRef);
      result = "processed";
    });

    if (paymentIntentCleanupDeferAlert.holdId) {
      await writeOperationalAlert({
        type: "cleanup_hold_deferred_payment_intent_on_hold",
        source: "cleanup-holds-logic",
        holdId: paymentIntentCleanupDeferAlert.holdId,
        hint:
          "Hold past expiry but deposit/full PaymentIntent id recorded — slot not released; rollbackPending set for manual review (payment may have succeeded).",
      });
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cleanup-holds] transaction failed", { holdId: holdRef.id, error: message }, err);
    return "failed";
  }
}
