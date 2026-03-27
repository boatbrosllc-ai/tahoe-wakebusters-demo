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
import { getDepartureInventoryRef } from "@/lib/booking/shared-departure-inventory";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { getCleanupHoldSlotAction } from "@/lib/booking/cleanup-holds-slot-action";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import type Stripe from "stripe";
import { upsertPendingRefundRecord } from "@/lib/booking/pending-refund-idempotent";
import { ResolveAndConvertPaymentError, resolveAndConvertPayment } from "@/lib/booking/resolve-and-convert-payment";
import { BlockCheckUnavailableError } from "@/lib/booking/has-overlapping-block";
import { LegacyScanLimitReachedError } from "@/lib/booking/slot-availability";
import { isBookingBlockedByOperatorError } from "@/lib/booking/convert-hold-to-booking";

export { getCleanupHoldSlotAction };

export function getRollbackPendingAutoReleaseMs(): number {
  const n = parseInt(process.env.ROLLBACK_PENDING_AUTO_RELEASE_MS ?? "600000", 10);
  return Number.isFinite(n) && n >= 60_000 ? Math.min(n, 7 * 86400000) : 600000;
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

  let discountNextUsedCount: number | null = null;
  if (discountRef) {
    const dSnap = await tx.get(discountRef);
    if (dSnap.exists) {
      const d = dSnap.data() as { usedCount?: number };
      discountNextUsedCount = Math.max(0, (d.usedCount ?? 0) - 1);
    }
  }

  const slotSnap = await tx.get(slotRef);
  const shouldReleaseSharedCapacity = isSharedHold && Boolean(experienceId) && Boolean(dateStr);
  let inventoryRefForShared: ReturnType<typeof getDepartureInventoryRef> | null = null;
  let inventoryReservedSeats: number | null = null;
  if (shouldReleaseSharedCapacity) {
    inventoryRefForShared = getDepartureInventoryRef(db, experienceId!, dateStr);
    const inventorySnap = await tx.get(inventoryRefForShared);
    inventoryReservedSeats = inventorySnap.exists
      ? ((inventorySnap.data() as { reservedSeats?: number }).reservedSeats ?? 0)
      : 0;
  }

  const applySharedCapacityReleaseWrite = () => {
    if (!inventoryRefForShared || inventoryReservedSeats == null) return;
    tx.set(
      inventoryRefForShared,
      {
        reservedSeats: Math.max(0, inventoryReservedSeats - Math.max(0, (hold.partySize as number) ?? 0)),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  };

  const applyDiscountDecrementWrite = () => {
    if (!discountRef || discountNextUsedCount == null) return;
    tx.update(discountRef, { usedCount: discountNextUsedCount, updatedAt: FieldValue.serverTimestamp() });
  };

  if (!slotSnap.exists) {
    if (shouldReleaseSharedCapacity) {
      applySharedCapacityReleaseWrite();
    }
    tx.update(holdRef, { status: "expired", rollbackPending: FieldValue.delete(), rollbackPendingExpiresAt: FieldValue.delete() });
    applyDiscountDecrementWrite();
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
    if (shouldReleaseSharedCapacity) {
      applySharedCapacityReleaseWrite();
    }
  }
  // Correctness proof for shared capacity with action === "expire_only":
  // this hold no longer owns the slot and was replaced by another active hold in create-hold resume/new-hold paths.
  // The replacement path already wrote the net reservedSeats state, so releasing again here would double-decrement.

  tx.update(holdRef, { status: "expired", rollbackPending: FieldValue.delete(), rollbackPendingExpiresAt: FieldValue.delete() });
  applyDiscountDecrementWrite();
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
        // Sequence: hold expires -> cron marks rollbackPending -> rollbackPendingExpiresAt reached
        // -> Stripe PI checked by auto-resolve path -> slot released when no succeeded PI is observed.
        const alreadyFlagged = (hold as { rollbackPending?: boolean }).rollbackPending === true;
        const hasRpe = (hold as { rollbackPendingExpiresAt?: unknown }).rollbackPendingExpiresAt != null;
        const deadlineMs = Date.now() + getRollbackPendingAutoReleaseMs();
        if (!alreadyFlagged) {
          tx.update(holdRef, {
            rollbackPending: true,
            expiresAt: Timestamp.now(),
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

    const releaseSlot = async (): Promise<boolean> => {
      const releasedOk = await db.runTransaction(async (tx) => {
        const live = await tx.get(holdRef);
        if (!live.exists) return false;
        const h = live.data() as Record<string, unknown>;
        if ((h.status as string | undefined) !== "active" || h.rollbackPending !== true) return false;
        if (!isRollbackPendingPastAutoReleaseDeadline(h)) return false;
        return await expireHoldAndReleaseSlotInTransaction(tx, db, FieldValue, holdRef, h);
      });
      return releasedOk;
    };

    const fullPi = (hold as { fullPaymentIntentId?: string }).fullPaymentIntentId;
    const depPi = (hold as { depositPaymentIntentId?: string }).depositPaymentIntentId;
    const piIds = [fullPi, depPi].filter((id): id is string => typeof id === "string" && id.trim().length > 0);

    for (const piIdRaw of piIds) {
      const piId = piIdRaw.trim();
      try {
        const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["payment_method"] });
        if (pi.status !== "succeeded") continue;

        try {
          const conversion = await resolveAndConvertPayment(db, {
            paymentIntentId: piId,
            holdId: holdRef.id,
            source: "pi_webhook",
            paymentIntent: pi,
          });

          if ("alreadyConverted" in conversion.result || "bookingId" in conversion.result) {
            await writeOperationalAlert({
              type: "rollback_pending_hold_late_conversion_recovered",
              source: "rollback-pending-reconcile",
              holdId: holdRef.id,
              paymentIntentId: piId,
              hint: "rollbackPending auto-release deadline passed; late conversion succeeded.",
            });
            return "released";
          }

          // amountIntegrityMismatch is a permanent conversion block; pendingRefund is already upserted by convertHoldToBooking.
          await writeOperationalAlert({
            type: "rollback_pending_hold_late_conversion_amount_integrity_mismatch",
            source: "rollback-pending-reconcile",
            holdId: holdRef.id,
            paymentIntentId: piId,
            hint: "Conversion returned amountIntegrityMismatch; releasing slot after flagging pendingRefund.",
          });

          const releasedOk = await releaseSlot();
          return releasedOk ? "released" : "skipped";
        } catch (convErr) {
          // Retriable conversion errors: keep rollbackPending for the next cron cycle.
          if (
            convErr instanceof ResolveAndConvertPaymentError ||
            convErr instanceof BlockCheckUnavailableError ||
            convErr instanceof LegacyScanLimitReachedError
          ) {
            await writeOperationalAlert({
              type: "rollback_pending_hold_late_conversion_retriable_error",
              source: "rollback-pending-reconcile",
              holdId: holdRef.id,
              paymentIntentId: piId,
              hint:
                convErr instanceof Error
                  ? convErr.message.slice(0, 500)
                  : String(convErr).slice(0, 500),
            });
            return "skipped";
          }

          // Permanent conversion errors: flag pendingRefund then release slot.
          const piAmountTotal = typeof pi.amount === "number" ? pi.amount : undefined;
          const piCurrency = typeof pi.currency === "string" ? pi.currency : undefined;
          const customerEmail = (hold.customerDraft as { email?: string } | undefined)?.email;
          const errMsg = convErr instanceof Error ? convErr.message : String(convErr);

          try {
            if (isBookingBlockedByOperatorError(convErr)) {
              await upsertPendingRefundRecord(
                db,
                {
                  reason: "operator_date_blocked_at_conversion",
                  holdId: holdRef.id,
                  paymentIntentId: piId,
                },
                {
                  holdId: holdRef.id,
                  paymentIntentId: piId,
                  amountTotal: piAmountTotal,
                  currency: piCurrency,
                  ...(customerEmail && { customerEmail }),
                }
              );
            } else if (errMsg === "Hold has expired") {
              await upsertPendingRefundRecord(
                db,
                {
                  reason: "hold_expired_after_payment",
                  holdId: holdRef.id,
                  duplicatePaymentIntentId: piId,
                },
                {
                  holdId: holdRef.id,
                  duplicatePaymentIntentId: piId,
                  ...(customerEmail && { customerEmail }),
                }
              );
            } else {
              await upsertPendingRefundRecord(
                db,
                {
                  reason: "rollback_pending_hold_conversion_permanent_error",
                  holdId: holdRef.id,
                  paymentIntentId: piId,
                },
                {
                  holdId: holdRef.id,
                  paymentIntentId: piId,
                  amountTotal: piAmountTotal,
                  currency: piCurrency,
                  convertError: errMsg.slice(0, 500),
                  ...(customerEmail && { customerEmail }),
                }
              );
            }
          } catch (refundFlagErr) {
            console.error("[rollback-pending-reconcile] upsertPendingRefundRecord failed", {
              holdId: holdRef.id,
              paymentIntentId: piId,
              error: refundFlagErr instanceof Error ? refundFlagErr.message : String(refundFlagErr),
            });
          }

          await writeOperationalAlert({
            type: "rollback_pending_hold_late_conversion_permanent_error_releasing",
            source: "rollback-pending-reconcile",
            holdId: holdRef.id,
            paymentIntentId: piId,
            lastError: errMsg.slice(0, 500),
          });

          const releasedOk = await releaseSlot();
          return releasedOk ? "released" : "skipped";
        }
      } catch (piErr) {
        const msg = piErr instanceof Error ? piErr.message : String(piErr);
        console.warn("[rollback-pending-reconcile] payment_intent retrieve failed; skipping PI", {
          holdId: holdRef.id,
          piId,
          msg: msg.slice(0, 200),
        });
        continue;
      }
    }

    // No succeeded PaymentIntent observed: release the slot after rollbackPendingExpiresAt.
    const releasedOk = await releaseSlot();
    if (releasedOk) {
      await writeOperationalAlert({
        type: "rollback_pending_hold_auto_released_after_deadline",
        source: "rollback-pending-reconcile",
        holdId: holdRef.id,
        hint: "Slot released after rollbackPendingExpiresAt with no succeeded PaymentIntent observed.",
      }).catch(() => {});
    }
    return releasedOk ? "released" : "skipped";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[rollback-pending-reconcile] transaction failed", { holdId: holdRef.id, error: message }, err);
    return "failed";
  }
}
