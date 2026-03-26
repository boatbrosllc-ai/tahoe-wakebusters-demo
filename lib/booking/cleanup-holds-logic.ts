/**
 * Decision logic for cleanup-holds: when an expired hold's slot has been reassigned
 * to another hold (slot.holdId !== holdDocId), we still expire the hold and release
 * shared capacity instead of skipping. This prevents stale active holds and repeated cron work.
 *
 * Parallel cron invocations are serialized by a Firestore lock (`cron/cleanup-holds-lock`); see
 * `lib/booking/cleanup-holds-lock.ts` and the cleanup-holds API routes.
 */

import type { Firestore, DocumentReference, Transaction } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { getDepartureInventoryRef, releaseCapacity } from "@/lib/booking/shared-departure-inventory";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { getCleanupHoldSlotAction } from "@/lib/booking/cleanup-holds-slot-action";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import type Stripe from "stripe";

export { getCleanupHoldSlotAction };

export function getRollbackPendingAutoReleaseMs(): number {
  const n = parseInt(process.env.ROLLBACK_PENDING_AUTO_RELEASE_MS ?? "1800000", 10);
  return Number.isFinite(n) && n >= 60_000 ? Math.min(n, 7 * 86400000) : 1800000;
}

/** True when hold is past the auto-reconcile window (matches `runRollbackPendingAutoResolveTransaction` pre-check). */
export function isRollbackPendingPastAutoReleaseDeadline(hold: Record<string, unknown>): boolean {
  const nowMs = Date.now();
  const rpe = (hold.rollbackPendingExpiresAt as { toDate?: () => Date } | undefined)?.toDate?.();
  if (rpe) return rpe.getTime() <= nowMs;
  const expiresAtHold = (hold.expiresAt as { toDate?: () => Date } | undefined)?.toDate?.();
  if (!expiresAtHold) return false;
  return expiresAtHold.getTime() + getRollbackPendingAutoReleaseMs() <= nowMs;
}

/**
 * Single canonical transaction for expiring a hold: slot release, shared inventory, discount usedCount.
 * Used by public and admin cleanup-holds cron routes.
 * Pass a hold `DocumentReference` only — all reads happen inside the transaction (no pre-transaction hold snapshot).
 * Re-reads the hold document inside the transaction and only performs release/decrement side effects
 * when transitioning status from active → expired (avoids double-decrement when cleanup races release).
 */
type AdminFieldValue = typeof import("firebase-admin").firestore.FieldValue;

async function expireHoldAndReleaseSlotInTransaction(
  tx: Transaction,
  db: Firestore,
  FieldValue: AdminFieldValue,
  holdRef: DocumentReference,
  hold: Record<string, unknown>
): Promise<boolean> {
  const boatId = hold.boatId as string | undefined;
  const experienceId = hold.experienceId as string | undefined;
  const slotId = hold.slotId as string;
  if (!slotId || (!boatId && !experienceId)) {
    console.warn("[cleanup-holds] skipped hold missing slotId or boat/experience", { holdId: holdRef.id });
    return false;
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
    tx.update(holdRef, { status: "expired", rollbackPending: FieldValue.delete(), rollbackPendingExpiresAt: FieldValue.delete() });
    await applyDiscountDecrement(discountRef);
    return true;
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

  tx.update(holdRef, { status: "expired", rollbackPending: FieldValue.delete(), rollbackPendingExpiresAt: FieldValue.delete() });
  await applyDiscountDecrement(discountRef);
  return true;
}

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
        const hasRpe = (hold as { rollbackPendingExpiresAt?: unknown }).rollbackPendingExpiresAt != null;
        const deadlineMs = Date.now() + getRollbackPendingAutoReleaseMs();
        if (!alreadyFlagged) {
          tx.update(holdRef, {
            rollbackPending: true,
            rollbackPendingExpiresAt: Timestamp.fromMillis(deadlineMs),
            updatedAt: FieldValue.serverTimestamp(),
          });
          paymentIntentCleanupDeferAlert.holdId = holdRef.id;
        } else if (!hasRpe) {
          tx.update(holdRef, {
            rollbackPendingExpiresAt: Timestamp.fromMillis(deadlineMs),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        result = "processed";
        return;
      }

      const expiredOk = await expireHoldAndReleaseSlotInTransaction(tx, db, FieldValue, holdRef, hold);
      if (expiredOk) result = "processed";
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

/**
 * After `rollbackPendingExpiresAt`, verify Stripe PaymentIntent status and either release the slot
 * (no successful charge) or emit an alert (success — needs conversion / manual follow-up).
 */
export async function runRollbackPendingAutoResolveTransaction(
  db: Firestore,
  FieldValue: AdminFieldValue,
  holdRef: DocumentReference,
  stripe: Stripe
): Promise<"released" | "skipped" | "failed"> {
  try {
    const holdSnap = await holdRef.get();
    if (!holdSnap.exists) return "skipped";
    const hold = holdSnap.data() as Record<string, unknown>;
    if ((hold.status as string | undefined) !== "active" || hold.rollbackPending !== true) return "skipped";

    if (!isRollbackPendingPastAutoReleaseDeadline(hold)) return "skipped";

    const fullPi = (hold as { fullPaymentIntentId?: string }).fullPaymentIntentId;
    const depPi = (hold as { depositPaymentIntentId?: string }).depositPaymentIntentId;
    const piIds = [fullPi, depPi].filter((id): id is string => typeof id === "string" && id.trim().length > 0);

    for (const piId of piIds) {
      try {
        const pi = await stripe.paymentIntents.retrieve(piId.trim());
        if (pi.status === "succeeded") {
          await writeOperationalAlert({
            type: "rollback_pending_hold_pi_succeeded_after_deadline",
            source: "rollback-pending-reconcile",
            holdId: holdRef.id,
            paymentIntentId: piId,
            hint:
              "Rollback auto-release deadline passed but Stripe reports succeeded PaymentIntent; slot may still be held — review conversion / complete-after-payment.",
          });
          return "skipped";
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("[rollback-pending-reconcile] PI retrieve failed; proceeding with release attempt", {
          holdId: holdRef.id,
          piId,
          msg: msg.slice(0, 200),
        });
      }
    }

    const outcomeRef = { released: false };
    await db.runTransaction(async (tx) => {
      const live = await tx.get(holdRef);
      if (!live.exists) return;
      const h = live.data() as Record<string, unknown>;
      if ((h.status as string | undefined) !== "active" || h.rollbackPending !== true) return;

      if (!isRollbackPendingPastAutoReleaseDeadline(h)) return;

      const releasedOk = await expireHoldAndReleaseSlotInTransaction(tx, db, FieldValue, holdRef, h);
      if (releasedOk) outcomeRef.released = true;
    });

    if (outcomeRef.released) {
      await writeOperationalAlert({
        type: "rollback_pending_hold_auto_released_after_deadline",
        source: "rollback-pending-reconcile",
        holdId: holdRef.id,
        hint: "Slot released after rollbackPendingExpiresAt with no succeeded PaymentIntent observed.",
      }).catch(() => {});
    }

    return outcomeRef.released ? "released" : "skipped";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[rollback-pending-reconcile] transaction failed", { holdId: holdRef.id, error: message }, err);
    return "failed";
  }
}
