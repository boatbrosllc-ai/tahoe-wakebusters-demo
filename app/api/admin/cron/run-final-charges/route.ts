/**
 * Cron: attempt off-session final charge for bookings with finalChargeAt <= now.
 * Call with Authorization: Bearer CRON_SECRET.
 * Uses finalChargeLockAt to prevent double charging; webhook payment_intent.succeeded marks final_paid.
 * Reconciles bookings stuck in final_processing by inspecting existing final PaymentIntent status
 * and writing final_paid + stripe.finalChargedAt when Stripe reports succeeded (idempotent).
 *
 * Pagination: iterates all eligible documents using cursor-based pages until no
 * results remain. Per-run metrics: matched, processed (success + skipped + failed), attempted, successCount, skipped, failed.
 */

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import type { QueryDocumentSnapshot, DocumentData, DocumentReference } from "firebase-admin/firestore";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { sendFinalChargeFailedEmail } from "@/lib/booking/brevo";
import { logNotificationSent } from "@/lib/booking/email-log";
import { signManageToken } from "@/lib/booking/manageToken";
import { bookingEnv } from "@/lib/booking/env";
import {
  getFinalChargeIdempotencyKey,
  isFinalChargeLockRecent,
  isCustomerPayLockRecent,
  isCustomerFinalPiInFlightRecent,
  existingFinalPiAction,
  FINAL_CHARGE_LOCK_SKIP_MS,
} from "@/lib/booking/final-charge-idempotency";
import {
  tryBeginFinalFailureNotificationSend,
  finalizeFinalFailureNotification,
  clearFinalFailureNotificationLease,
} from "@/lib/booking/final-failure-dedupe";
import type { Booking } from "@/lib/booking/types";
import { bookingLog, bookingError, bookingWarn } from "@/lib/booking/debug";
import { assertCronPostAuthorized } from "@/lib/booking/cron-auth";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { applyFinalPaymentRevenueIncrement } from "@/lib/booking/summary-revenue";
import { addFinalChargeSuccessOutboxInTransaction } from "@/lib/booking/notification-outbox";
import { verifyIndexedStripeCustomerOrClear } from "@/lib/booking/stripe-customer-index";
import {
  persistFinalBalanceNormalizationIfNeeded,
  resolveFinalBalanceFromBooking,
} from "@/lib/booking/final-balance-resolver";
import { resetBookingSlotsToOpenInTransaction } from "@/lib/booking/slot-reset";

const PAGE_SIZE = 100;
const FINAL_FAILED_GRACE_HOURS = (() => {
  const n = parseInt(process.env.FINAL_FAILED_GRACE_HOURS ?? "72", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 24 * 30) : 72;
})();

async function alertIfPiAmountDiffersFromBookingExpected(
  bookingId: string,
  piAmount: number,
  booking: Booking,
  phase: string
): Promise<void> {
  const expected = resolveFinalBalanceFromBooking(booking).authoritativeFinalCents;
  if (!Number.isFinite(piAmount) || !Number.isFinite(expected)) return;
  if (Math.abs(piAmount - expected) > 1) {
    await writeOperationalAlert({
      type: "final_charge_pi_amount_vs_booking_balance_mismatch",
      bookingId,
      phase,
      source: "run-final-charges",
      piAmountCents: piAmount,
      expectedFinalFromBookingCents: expected,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Stripe PI succeeded but Firestore update failed — keep final_processing + PI id for webhook/cron reconcile; alert ops. */
async function recoverFinalChargeAfterFirestorePersistFailure(
  bookingRef: DocumentReference,
  pi: { id: string; status: string },
  fsErr: unknown
): Promise<void> {
  const { Timestamp } = getFirestoreExports();
  const lockUntil = new Date(Date.now() + FINAL_CHARGE_LOCK_SKIP_MS);
  let lastRecoveryErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await bookingRef.update({
        "stripe.finalPaymentIntentId": pi.id,
        status: "final_processing",
        "stripe.finalChargeLockAt": Timestamp.fromDate(lockUntil),
        updatedAt: Timestamp.now(),
      });
      lastRecoveryErr = undefined;
      break;
    } catch (recoveryErr) {
      lastRecoveryErr = recoveryErr;
      if (attempt < 2) await sleep(150 * 2 ** attempt);
    }
  }
  if (lastRecoveryErr != null) {
    console.error("[run-final-charges] recovery update failed after Firestore error post-PI", lastRecoveryErr);
  }
  await writeOperationalAlert({
    type: "final_charge_firestore_persist_failed_after_pi_created",
    bookingId: bookingRef.id,
    paymentIntentId: pi.id,
    piStatus: pi.status,
    source: "run-final-charges",
    phase: "final_due_create_pi",
    errorMessage: fsErr instanceof Error ? fsErr.message : String(fsErr),
  });
}

export async function POST(request: NextRequest) {
  try {
    const authErr = await assertCronPostAuthorized(request);
    if (authErr) return authErr;
    const db = getDb();
    const { Timestamp, FieldValue } = getFirestoreExports();
    const now = new Date();
    const nowTs = Timestamp.fromDate(now);

    let matched = 0;
    let attempted = 0;
    let successCount = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];
    const stripe = getStripe();

    // Phase 1: Reconcile final_processing — inspect existing final PaymentIntent; if Stripe reports succeeded, write final_paid immediately (idempotent).
    let reconcileCursor: QueryDocumentSnapshot<DocumentData> | null = null;
    while (true) {
      let reconcileQ = db
        .collection("bookings")
        .where("status", "==", "final_processing")
        .limit(PAGE_SIZE);
      if (reconcileCursor) reconcileQ = reconcileQ.startAfter(reconcileCursor);
      const reconcileSnap = await reconcileQ.get();
      if (reconcileSnap.empty) break;
      for (const doc of reconcileSnap.docs) {
        const booking = doc.data() as Booking;
        const bookingId = doc.id;
        const existingFinalPiId = booking.stripe?.finalPaymentIntentId;
        if (!existingFinalPiId) continue;
        try {
          const existingPi = await stripe.paymentIntents.retrieve(existingFinalPiId);
          const piStatus = existingPi.status;
          if (piStatus === "succeeded") {
            let depositFlowMissingAuthoritativeRevenue = false;
            await db.runTransaction(async (tx) => {
              const ref = db.collection("bookings").doc(bookingId);
              const snap = await tx.get(ref);
              if (!snap.exists) return;
              const b = snap.data() as Booking;
              if (b.status === "final_paid" && b.stripe?.finalChargedAt) {
                return;
              }
              const sb = b.stripe;
              const isDepositFlow = typeof sb?.depositAmountCents === "number";
              let finalRev = typeof sb?.finalAmountCents === "number" ? sb.finalAmountCents : 0;
              if (finalRev <= 0 && isDepositFlow) {
                finalRev = resolveFinalBalanceFromBooking(b).authoritativeFinalCents;
                if (finalRev <= 0) {
                  depositFlowMissingAuthoritativeRevenue = true;
                }
              }
              if (isDepositFlow && finalRev > 0 && sb?.finalRevenueSummaryApplied !== true) {
                applyFinalPaymentRevenueIncrement(tx, db, FieldValue, finalRev, b, bookingId);
              }
              tx.update(ref, {
                status: "final_paid",
                "stripe.finalChargedAt": FieldValue.serverTimestamp(),
                ...(isDepositFlow && finalRev > 0 && sb?.finalRevenueSummaryApplied !== true
                  ? { "stripe.finalRevenueSummaryApplied": true }
                  : {}),
                updatedAt: Timestamp.now(),
              });
              await addFinalChargeSuccessOutboxInTransaction(tx, db, bookingId);
            });
            if (depositFlowMissingAuthoritativeRevenue) {
              const piAmt = typeof existingPi.amount === "number" ? existingPi.amount : 0;
              await alertIfPiAmountDiffersFromBookingExpected(bookingId, piAmt, booking, "reconcile_final_processing");
              await writeOperationalAlert({
                type: "final_charge_revenue_manual_reconciliation_required",
                bookingId,
                paymentIntentId: existingFinalPiId,
                source: "run-final-charges",
                phase: "reconcile_final_processing",
                reason: "deposit_flow_missing_total_or_deposit_cents",
              });
            }
            console.log("[run-final-charges] reconciled final_processing → final_paid", { bookingId, piId: existingFinalPiId });
            continue;
          }
          // Terminal incomplete or failed: allow retries by resetting status and clearing stale intent.
          if (
            piStatus === "canceled" ||
            piStatus === "requires_payment_method" ||
            piStatus === "requires_confirmation"
          ) {
            let resetApplied = false;
            await db.runTransaction(async (tx) => {
              const ref = db.collection("bookings").doc(bookingId);
              const snap = await tx.get(ref);
              if (!snap.exists) return;
              const b = snap.data() as Booking;
              if (b.status !== "final_processing") return;
              const customerLocksFresh =
                isCustomerPayLockRecent(b.stripe?.customerPayLockAt, now) ||
                isCustomerFinalPiInFlightRecent(b.stripe?.customerFinalPiInFlightAt, now);
              if (customerLocksFresh) return;
              tx.update(ref, {
                status: "final_due",
                "stripe.finalPaymentIntentId": FieldValue.delete(),
                updatedAt: Timestamp.now(),
              });
              resetApplied = true;
            });
            if (!resetApplied) {
              continue;
            }
            bookingLog("run-final-charges", "stale final_processing intent recovery", {
              bookingId,
              piIdPrefix: existingFinalPiId.slice(0, 8),
              piStatus,
              metric: "cron_stale_final_intent_recovered",
            });
            await writeOperationalAlert({
              type: "cron_stale_final_intent_recovered",
              bookingId,
              paymentIntentId: existingFinalPiId,
              piStatus,
              phase: "reconcile_final_processing",
              source: "run-final-charges",
            });
            console.log("[run-final-charges] reconciled final_processing → final_due (stale intent cleared)", {
              bookingId,
              piId: existingFinalPiId,
              piStatus,
            });
            continue;
          }
          if (piStatus === "requires_action") {
            await db.collection("bookings").doc(bookingId).update({
              status: "final_requires_action",
              updatedAt: Timestamp.now(),
            });
            console.log("[run-final-charges] reconciled final_processing → final_requires_action", {
              bookingId,
              piId: existingFinalPiId,
            });
            continue;
          }
          // processing: leave as final_processing; will reconcile on a later run when succeeded.
        } catch (retrieveErr: unknown) {
          const err = retrieveErr as { code?: string; message?: string; type?: string };
          bookingError("run-final-charges", "reconcile final_processing: PaymentIntent retrieve failed", retrieveErr, {
            bookingId,
            existingFinalPiId,
            code: err.code,
          });
          console.error("[run-final-charges] reconcile final_processing: PaymentIntent retrieve failed", {
            bookingId,
            existingFinalPiId,
            code: err.code,
            message: err.message,
          });
          if (err.code === "resource_missing") {
            let resetApplied = false;
            await db.runTransaction(async (tx) => {
              const ref = db.collection("bookings").doc(bookingId);
              const snap = await tx.get(ref);
              if (!snap.exists) return;
              const b = snap.data() as Booking;
              if (b.status !== "final_processing") return;
              const customerLocksFresh =
                isCustomerPayLockRecent(b.stripe?.customerPayLockAt, now) ||
                isCustomerFinalPiInFlightRecent(b.stripe?.customerFinalPiInFlightAt, now);
              if (customerLocksFresh) return;
              tx.update(ref, {
                status: "final_due",
                "stripe.finalPaymentIntentId": FieldValue.delete(),
                updatedAt: Timestamp.now(),
              });
              resetApplied = true;
            });
            if (resetApplied) {
              await writeOperationalAlert({
                type: "final_charge_pi_retrieve_resource_missing",
                bookingId,
                paymentIntentId: existingFinalPiId,
                phase: "reconcile_final_processing",
                source: "run-final-charges",
              });
            }
          }
        }
      }
      if (reconcileSnap.size < PAGE_SIZE) break;
      reconcileCursor = reconcileSnap.docs[reconcileSnap.docs.length - 1];
    }

    let cursor: QueryDocumentSnapshot<DocumentData> | null = null;

    while (true) {
      let q = db
        .collection("bookings")
        .where("status", "==", "final_due")
        .where("finalChargeAt", "<=", nowTs)
        .orderBy("finalChargeAt", "asc")
        .limit(PAGE_SIZE);

      if (cursor) q = q.startAfter(cursor);

      const snap = await q.get();
      if (snap.empty) break;

      matched += snap.size;

      for (const doc of snap.docs) {
        const booking = doc.data() as Booking;
        const bookingId = doc.id;
        const waiver = booking.waiver;
        if (waiver?.requestId && waiver.status !== "signed") {
          skipped++;
          try {
            await writeOperationalAlert({
              type: "final_charge_waiver_blocked",
              bookingId,
              source: "run-final-charges",
              waiverStatus: waiver.status,
            });
            await db.collection("bookings").doc(bookingId).update({
              "stripe.finalChargeWaiverBlockedReason": "final_charge_waiver_blocked",
              updatedAt: FieldValue.serverTimestamp(),
            });
          } catch (waiverBlockErr) {
            console.error("[run-final-charges] waiver block alert/update failed", bookingId, waiverBlockErr);
          }
          continue;
        }
        if (booking.stripe?.pendingFinalPaymentIntentKey) {
          if (isCustomerFinalPiInFlightRecent(booking.stripe?.customerFinalPiInFlightAt, now)) {
            skipped++;
            continue;
          }
          // Stale in-flight timestamp: pending key is orphaned after crash — do not skip; lock txn will clear fields.
        }
        if (isFinalChargeLockRecent(booking.stripe?.finalChargeLockAt, now)) {
          skipped++;
          continue;
        }
        if (isCustomerPayLockRecent(booking.stripe?.customerPayLockAt, now)) {
          skipped++;
          continue;
        }
        if (isCustomerFinalPiInFlightRecent(booking.stripe?.customerFinalPiInFlightAt, now)) {
          skipped++;
          continue;
        }
        let customerId = booking.stripe?.customerId;
        const paymentMethodId = booking.stripe?.paymentMethodId;
        const existingFinalPiId = booking.stripe?.finalPaymentIntentId;
        if (existingFinalPiId) {
          try {
            const existingPi = await stripe.paymentIntents.retrieve(existingFinalPiId);
            const bookingRefForFresh = db.collection("bookings").doc(bookingId);
            const freshLocks = await db.runTransaction(async (tx) => {
              const s = await tx.get(bookingRefForFresh);
              if (!s.exists) return { locksFresh: true };
              const b = s.data() as Booking;
              const locksFresh =
                isCustomerPayLockRecent(b.stripe?.customerPayLockAt, now) ||
                isCustomerFinalPiInFlightRecent(b.stripe?.customerFinalPiInFlightAt, now);
              return { locksFresh };
            });
            const customerLocksFresh = freshLocks.locksFresh;
            const action = existingFinalPiAction(existingPi.status, {
              context: "cron",
              hasStoredFinalPaymentIntentId: true,
              customerLocksFresh,
            });
            if (action === "reconcile") {
              const bookingRef = db.collection("bookings").doc(bookingId);
              let depositFlowMissingAuthoritativeRevenueReconcile = false;
              await db.runTransaction(async (tx) => {
                const snap = await tx.get(bookingRef);
                if (!snap.exists) return;
                const b = snap.data() as Booking;
                if (b.status === "final_paid" && b.stripe?.finalChargedAt) {
                  return;
                }
                const sb = b.stripe;
                const isDepositFlow = typeof sb?.depositAmountCents === "number";
                let finalRev = typeof sb?.finalAmountCents === "number" ? sb.finalAmountCents : 0;
                if (finalRev <= 0 && isDepositFlow) {
                  finalRev = resolveFinalBalanceFromBooking(b).authoritativeFinalCents;
                  if (finalRev <= 0) {
                    depositFlowMissingAuthoritativeRevenueReconcile = true;
                  }
                }
                const alreadySummarized = sb?.finalRevenueSummaryApplied === true;
                if (isDepositFlow && finalRev > 0 && !alreadySummarized) {
                  applyFinalPaymentRevenueIncrement(tx, db, FieldValue, finalRev, b, bookingId);
                }
                tx.update(bookingRef, {
                  status: "final_paid",
                  "stripe.finalChargedAt": FieldValue.serverTimestamp(),
                  updatedAt: Timestamp.now(),
                  ...(isDepositFlow && finalRev > 0 && !alreadySummarized
                    ? { "stripe.finalRevenueSummaryApplied": true }
                    : {}),
                });
                await addFinalChargeSuccessOutboxInTransaction(tx, db, bookingId);
              });
              if (depositFlowMissingAuthoritativeRevenueReconcile) {
                const piAmt = typeof existingPi.amount === "number" ? existingPi.amount : 0;
                await alertIfPiAmountDiffersFromBookingExpected(bookingId, piAmt, booking, "final_due_reconcile_existing_pi");
                await writeOperationalAlert({
                  type: "final_charge_revenue_manual_reconciliation_required",
                  bookingId,
                  paymentIntentId: existingFinalPiId,
                  source: "run-final-charges",
                  phase: "final_due_reconcile_existing_pi",
                  reason: "deposit_flow_missing_total_or_deposit_cents",
                });
              }
              attempted++;
              successCount++;
              continue;
            }
            if (action === "skip") {
              skipped++;
              continue;
            }
            // create: cancel stale/abandoned intent only after transactional confirmation that customer locks are not fresh
            bookingLog("run-final-charges", "stale final_due intent recovery (cancel + clear)", {
              bookingId,
              piIdPrefix: existingFinalPiId.slice(0, 8),
              piStatus: existingPi.status,
              customerLocksFresh,
              metric: "cron_stale_final_intent_recovered",
            });
            await writeOperationalAlert({
              type: "cron_stale_final_intent_recovered",
              bookingId,
              paymentIntentId: existingFinalPiId,
              piStatus: existingPi.status,
              phase: "final_due_loop",
              source: "run-final-charges",
            });
            let mayCancel = false;
            await db.runTransaction(async (tx) => {
              const ref = db.collection("bookings").doc(bookingId);
              const snap = await tx.get(ref);
              if (!snap.exists) return;
              const b = snap.data() as Booking;
              if (b.status !== "final_due") return;
              const locksFresh =
                isCustomerPayLockRecent(b.stripe?.customerPayLockAt, now) ||
                isCustomerFinalPiInFlightRecent(b.stripe?.customerFinalPiInFlightAt, now);
              if (locksFresh) return;
              mayCancel = true;
            });
            if (!mayCancel) {
              skipped++;
              continue;
            }
            let canClearStaleIntent =
              existingPi.status === "canceled" || existingPi.status === "requires_payment_method";
            if (!canClearStaleIntent) {
              try {
                const cancelResult = await stripe.paymentIntents.cancel(existingFinalPiId);
                canClearStaleIntent =
                  cancelResult.status === "canceled" ||
                  cancelResult.status === "requires_payment_method";
              } catch (cancelErr) {
                const msg = cancelErr instanceof Error ? cancelErr.message : String(cancelErr);
                bookingWarn("run-final-charges", "cancel stale final PI failed; booking skipped for this run", {
                  bookingId,
                  existingFinalPiId,
                  piStatus: existingPi.status,
                  error: msg,
                });
                await writeOperationalAlert({
                  type: "final_charge_stale_pi_not_cancelable",
                  bookingId,
                  paymentIntentId: existingFinalPiId,
                  source: "run-final-charges",
                  phase: "final_due_loop",
                  piStatus: existingPi.status,
                  error: msg,
                });
                skipped++;
                continue;
              }
            }
            if (!canClearStaleIntent) {
              bookingWarn("run-final-charges", "stale final PI not cancelable; booking skipped for this run", {
                bookingId,
                existingFinalPiId,
                piStatus: existingPi.status,
              });
              skipped++;
              continue;
            }
            await db.runTransaction(async (tx) => {
              const ref = db.collection("bookings").doc(bookingId);
              const snap = await tx.get(ref);
              if (!snap.exists) return;
              const b = snap.data() as Booking;
              const locksFresh =
                isCustomerPayLockRecent(b.stripe?.customerPayLockAt, now) ||
                isCustomerFinalPiInFlightRecent(b.stripe?.customerFinalPiInFlightAt, now);
              if (locksFresh) return;
              tx.update(ref, {
                "stripe.finalPaymentIntentId": FieldValue.delete(),
                updatedAt: Timestamp.now(),
              });
            });
          } catch (retrieveErr: unknown) {
            const err = retrieveErr as { code?: string; message?: string; type?: string };
            bookingError("run-final-charges", "final_due loop: PaymentIntent retrieve failed before create", retrieveErr, {
              bookingId,
              existingFinalPiId,
              code: err.code,
            });
            console.error("[run-final-charges] final_due loop: PaymentIntent retrieve failed before create", {
              bookingId,
              existingFinalPiId,
              code: err.code,
              message: err.message,
            });
            if (err.code === "resource_missing") {
              let resetApplied = false;
              await db.runTransaction(async (tx) => {
                const ref = db.collection("bookings").doc(bookingId);
                const snap = await tx.get(ref);
                if (!snap.exists) return;
                const b = snap.data() as Booking;
                if (b.status !== "final_due") return;
                const locksFresh =
                  isCustomerPayLockRecent(b.stripe?.customerPayLockAt, now) ||
                  isCustomerFinalPiInFlightRecent(b.stripe?.customerFinalPiInFlightAt, now);
                if (locksFresh) return;
                tx.update(ref, {
                  status: "final_due",
                  "stripe.finalPaymentIntentId": FieldValue.delete(),
                  updatedAt: Timestamp.now(),
                });
                resetApplied = true;
              });
              if (resetApplied) {
                await writeOperationalAlert({
                  type: "final_charge_pi_retrieve_resource_missing",
                  bookingId,
                  paymentIntentId: existingFinalPiId,
                  phase: "final_due_loop",
                  source: "run-final-charges",
                });
              }
            }
            // Non-missing errors: proceed to create a new PI below
          }
        }
        const bookingRefForBalance = db.collection("bookings").doc(bookingId);
        const { authoritativeFinalCents } = await persistFinalBalanceNormalizationIfNeeded(bookingRefForBalance, booking, {
          bookingId,
          source: "run-final-charges",
        });
        if (!customerId && booking.customer?.email) {
          const emailKey = booking.customer.email.trim().toLowerCase();
          if (emailKey) {
            try {
              const idxRef = db.collection("stripeCustomerIndex").doc(emailKey);
              const idxSnap = await idxRef.get();
              const indexedId = idxSnap.exists ? (idxSnap.data() as { customerId?: string | null })?.customerId : undefined;
              if (typeof indexedId === "string" && indexedId.trim()) {
                const verified = await verifyIndexedStripeCustomerOrClear(
                  stripe,
                  idxRef,
                  emailKey,
                  indexedId,
                  "run-final-charges"
                );
                if (verified) {
                  customerId = verified;
                  await db.collection("bookings").doc(bookingId).update({
                    "stripe.customerId": verified,
                    updatedAt: FieldValue.serverTimestamp(),
                  });
                }
              }
              if (!customerId) {
                const list = await stripe.customers.list({ email: emailKey, limit: 1 });
                const listedId = list.data[0]?.id;
                if (listedId) {
                  customerId = listedId;
                  await db.collection("bookings").doc(bookingId).update({
                    "stripe.customerId": listedId,
                    updatedAt: FieldValue.serverTimestamp(),
                  });
                }
              }
            } catch (recoverErr) {
              bookingWarn("run-final-charges", "stripe customer recovery lookup failed", {
                bookingId,
                error: recoverErr instanceof Error ? recoverErr.message : String(recoverErr),
              });
            }
          }
        }
        if (!customerId || !paymentMethodId || authoritativeFinalCents <= 0) {
          console.warn("[run-final-charges] booking missing customerId/pm or zero final balance", { bookingId });
          const missingFields: string[] = [];
          if (!customerId) missingFields.push("stripe.customerId");
          if (!paymentMethodId) missingFields.push("stripe.paymentMethodId");
          if (authoritativeFinalCents <= 0) missingFields.push("final_balance_from_totals");
          await writeOperationalAlert({
            type: "final_charge_missing_stripe_data",
            bookingId,
            details: { missingFields },
            source: "run-final-charges",
          });
          errors.push(`${bookingId}: missing stripe data`);
          failed++;
          continue;
        }

        type LockTxResult = { acquired: true } | { acquired: false; reason: string };
        let lockAcquired: boolean;
        try {
          const txResult = await db.runTransaction(async (tx): Promise<LockTxResult> => {
            const bookingRef = db.collection("bookings").doc(bookingId);
            const snap = await tx.get(bookingRef);
            if (!snap.exists) return { acquired: false, reason: "not_found" };
            const b = snap.data() as Booking;
            if (b.status !== "final_due") return { acquired: false, reason: "status_changed" };
            if (b.stripe?.pendingFinalPaymentIntentKey) {
              if (isCustomerFinalPiInFlightRecent(b.stripe?.customerFinalPiInFlightAt, now)) {
                return { acquired: false, reason: "pending_final_pi_idempotency_key" };
              }
              // Crash left pending key without a fresh in-flight marker — clear in same write as lock acquisition.
            }
            const lockAt = b.stripe?.finalChargeLockAt;
            if (isFinalChargeLockRecent(lockAt, now)) return { acquired: false, reason: "lock_held" };
            if (isCustomerPayLockRecent(b.stripe?.customerPayLockAt, now)) {
              return { acquired: false, reason: "customer_pay_lock" };
            }
            if (isCustomerFinalPiInFlightRecent(b.stripe?.customerFinalPiInFlightAt, now)) {
              return { acquired: false, reason: "customer_final_pi_in_flight" };
            }
            const clearStalePendingPiKey =
              Boolean(b.stripe?.pendingFinalPaymentIntentKey) &&
              !isCustomerFinalPiInFlightRecent(b.stripe?.customerFinalPiInFlightAt, now);
            tx.update(bookingRef, {
              ...(clearStalePendingPiKey
                ? {
                    "stripe.pendingFinalPaymentIntentKey": FieldValue.delete(),
                    "stripe.customerFinalPiInFlightAt": FieldValue.delete(),
                  }
                : {}),
              "stripe.finalChargeLockAt": nowTs,
              "stripe.finalChargeAttemptedAt": nowTs,
              updatedAt: FieldValue.serverTimestamp(),
            });
            return { acquired: true };
          });
          lockAcquired = txResult.acquired;
          if (!lockAcquired) {
            skipped++;
            continue;
          }
        } catch (txErr) {
          console.warn("[run-final-charges] lock transaction failed", { bookingId }, txErr);
          skipped++;
          continue;
        }

        let pi: Stripe.PaymentIntent;
        try {
          pi = await stripe.paymentIntents.create(
            {
              amount: authoritativeFinalCents,
              currency: "usd",
              customer: customerId,
              payment_method: paymentMethodId,
              off_session: true,
              confirm: true,
              metadata: { bookingId, payment_stage: "final" },
            },
            { idempotencyKey: getFinalChargeIdempotencyKey(bookingId, "cron", undefined, authoritativeFinalCents) }
          );
        } catch (stripeErr: unknown) {
          const err = stripeErr as { code?: string; type?: string; message?: string; payment_intent?: { id?: string } };
          const code = err.code ?? err.type;
          const failedPiId = err.payment_intent?.id;
          const isIdempotencyError = code === "idempotency_error" || err.type === "idempotency_error";
          if (isIdempotencyError) {
            await db.collection("bookings").doc(bookingId).update({
              "stripe.finalChargeLockAt": FieldValue.delete(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            console.log("[run-final-charges] idempotency conflict — lock cleared, staying final_due for retry", {
              bookingId,
              code,
            });
            skipped++;
            continue;
          }
          const requiresAction =
            code === "authentication_required" ||
            code === "card_authentication_required" ||
            (typeof err.message === "string" && err.message.toLowerCase().includes("authenticate"));
          const newStatus = requiresAction ? "final_requires_action" : "final_failed";
          await db.collection("bookings").doc(bookingId).update({
            status: newStatus,
            "stripe.finalError": { code, message: err.message ?? undefined },
            "stripe.finalChargeLockAt": FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          console.log("[run-final-charges] final charge failed, lock cleared, status updated", { bookingId, newStatus, code });
          attempted++;
          failed++;
          errors.push(`${bookingId}: ${code ?? err.message}`);
          const shouldSend = await tryBeginFinalFailureNotificationSend(db, bookingId, failedPiId);
          if (shouldSend) {
            try {
              let manageLink: string | undefined;
              const custEmail = booking.customer?.email?.trim();
              if (bookingEnv.manageBookingSecret && custEmail) {
                const token = signManageToken({
                  bookingId,
                  tripDateStr: booking.startDateStr,
                });
                if (token) manageLink = `${bookingEnv.appBaseUrl}/booking/manage?token=${encodeURIComponent(token)}`;
              }
              const subject = requiresAction ? "Action needed to complete your booking – Boat Bros ATX" : "Payment failed for your upcoming trip – Boat Bros ATX";
              await sendFinalChargeFailedEmail(booking.customer.email, booking.customer.name, manageLink, requiresAction);
              await logNotificationSent({
                channel: "email",
                to: booking.customer.email,
                toName: booking.customer.name,
                templateId: "final_charge_failed",
                subject,
                bookingId,
                eventSubtype: "final_charge_failed",
              }).catch((logErr) => console.error("[run-final-charges] logNotificationSent failed", bookingId, logErr));
              await finalizeFinalFailureNotification(db, bookingId, failedPiId);
            } catch (emailErr) {
              console.error("[run-final-charges] sendFinalChargeFailedEmail failed", bookingId, emailErr);
              await clearFinalFailureNotificationLease(db, bookingId).catch((clearErr) =>
                console.error("[run-final-charges] clearFinalFailureNotificationLease failed", bookingId, clearErr)
              );
            }
          }
          continue;
        }

        const bookingRef = db.collection("bookings").doc(bookingId);
        const isSucceeded = pi.status === "succeeded";

        try {
          if (isSucceeded) {
            let depositFlowMissingAuthoritativeRevenueCreate = false;
            await db.runTransaction(async (tx) => {
              const snap = await tx.get(bookingRef);
              if (!snap.exists) return;
              const b = snap.data() as Booking;
              const sb = b.stripe;
              const isDepositFlow = typeof sb?.depositAmountCents === "number";
              let finalRev = typeof sb?.finalAmountCents === "number" && sb.finalAmountCents > 0 ? sb.finalAmountCents : 0;
              if (finalRev <= 0 && isDepositFlow) {
                finalRev = resolveFinalBalanceFromBooking(b).authoritativeFinalCents;
                if (finalRev <= 0) {
                  depositFlowMissingAuthoritativeRevenueCreate = true;
                }
              }
              if (isDepositFlow && finalRev > 0 && sb?.finalRevenueSummaryApplied !== true) {
                applyFinalPaymentRevenueIncrement(tx, db, FieldValue, finalRev, b, bookingId);
              }
              tx.update(bookingRef, {
                "stripe.finalPaymentIntentId": pi.id,
                "stripe.finalChargedAt": FieldValue.serverTimestamp(),
                status: "final_paid",
                ...(isDepositFlow && finalRev > 0 && sb?.finalRevenueSummaryApplied !== true
                  ? { "stripe.finalRevenueSummaryApplied": true }
                  : {}),
                updatedAt: Timestamp.now(),
              });
              await addFinalChargeSuccessOutboxInTransaction(tx, db, bookingId);
            });
            if (depositFlowMissingAuthoritativeRevenueCreate) {
              const piAmt = typeof pi.amount === "number" ? pi.amount : 0;
              await alertIfPiAmountDiffersFromBookingExpected(bookingId, piAmt, booking, "final_due_create_pi");
              await writeOperationalAlert({
                type: "final_charge_revenue_manual_reconciliation_required",
                bookingId,
                paymentIntentId: pi.id,
                source: "run-final-charges",
                phase: "final_due_create_pi",
                reason: "deposit_flow_missing_total_or_deposit_cents",
              });
            }
          } else {
            // Non-succeeded PI (e.g. processing): persist id + final_processing. Failures hit the same catch as the
            // succeeded transaction path and call recoverFinalChargeAfterFirestorePersistFailure so the next run
            // reconciles via existing PI instead of creating another charge.
            await bookingRef.update({
              "stripe.finalPaymentIntentId": pi.id,
              status: "final_processing",
              updatedAt: Timestamp.now(),
            });
          }
        } catch (fsErr: unknown) {
          console.error("[run-final-charges] Firestore persist failed after Stripe PI create", bookingId, fsErr);
          await recoverFinalChargeAfterFirestorePersistFailure(bookingRef, pi, fsErr);
          attempted++;
          successCount++;
          continue;
        }

        if (isSucceeded) {
          console.log("[run-final-charges] PaymentIntent succeeded immediately (final_paid persisted)", { bookingId, piId: pi.id });
        } else {
          console.log("[run-final-charges] PaymentIntent created (webhook will set final_paid)", { bookingId, piId: pi.id });
        }
        attempted++;
        successCount++;
      }

      if (snap.size < PAGE_SIZE) break;
      cursor = snap.docs[snap.docs.length - 1];
    }

    // processed = mutually exclusive outcomes: success + skipped + failed (no double-count)
    const processed = successCount + skipped + failed;

    const todayStr = now.toISOString().slice(0, 10);
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + 7);
    const horizonStr = horizon.toISOString().slice(0, 10);
    const unsignedNearTrip: string[] = [];
    for (const st of ["paid", "final_due", "final_paid"] as const) {
      const nearSnap = await db
        .collection("bookings")
        .where("status", "==", st)
        .where("startDateStr", ">=", todayStr)
        .where("startDateStr", "<=", horizonStr)
        .limit(80)
        .get();
      for (const d of nearSnap.docs) {
        const b = d.data() as Booking;
        const w = b.waiver;
        if (!w || w.status !== "signed") unsignedNearTrip.push(d.id);
      }
    }
    if (unsignedNearTrip.length > 0) {
      await writeOperationalAlert({
        type: "pre_trip_waiver_unsigned",
        bookingIds: unsignedNearTrip.slice(0, 40),
        count: unsignedNearTrip.length,
        source: "run-final-charges",
      });
    }
    try {
      const finalDuePastDueSnap = await db
        .collection("bookings")
        .where("status", "==", "final_due")
        .where("finalChargeAt", "<=", nowTs)
        .limit(400)
        .get();
      let missingStripeCustomerCount = 0;
      for (const d of finalDuePastDueSnap.docs) {
        const b = d.data() as Booking;
        if (!b.stripe?.customerId) missingStripeCustomerCount++;
      }
      if (missingStripeCustomerCount > 0) {
        await writeOperationalAlert({
          type: "final_charge_missing_stripe_data_summary",
          source: "run-final-charges",
          missingStripeCustomerCount,
          scannedFinalDuePastDueCount: finalDuePastDueSnap.size,
        });
      }
    } catch (summaryErr) {
      bookingWarn("run-final-charges", "missing-stripe-data summary query failed", { err: summaryErr });
    }

    try {
      const pendingSnap = await db
        .collection("pendingRefunds")
        .where("status", "==", "pending")
        .where("bookingId", ">", "")
        .limit(50)
        .get();
      const bookingIds = Array.from(
        new Set(
          pendingSnap.docs
            .map((d) => {
              const bid = (d.data() as { bookingId?: string }).bookingId;
              return typeof bid === "string" && bid.trim() ? bid.trim() : null;
            })
            .filter((x): x is string => x != null)
        )
      );
      if (bookingIds.length > 0) {
        const refs = bookingIds.map((id) => db.collection("bookings").doc(id));
        const snaps = await db.getAll(...refs);
        const missing = bookingIds.filter((id, i) => !snaps[i]?.exists);
        for (const bookingId of missing) {
          await writeOperationalAlert({
            type: "orphaned_payment_no_booking",
            bookingId,
            source: "run-final-charges",
            message: "pendingRefunds row references a bookingId with no booking document",
          });
        }
      }
    } catch (orphanErr) {
      console.error("[run-final-charges] orphaned pendingRefunds scan failed", orphanErr);
    }

    // Auto-cancel long-stuck final_failed bookings so slots are eventually released.
    try {
      const cutoff = new Date(Date.now() - FINAL_FAILED_GRACE_HOURS * 60 * 60 * 1000);
      const cutoffTs = Timestamp.fromDate(cutoff);
      const [staleByFinalChargeAtSnap, staleByUpdatedAtSnap] = await Promise.all([
        db
          .collection("bookings")
          .where("status", "==", "final_failed")
          .where("finalChargeAt", "<=", cutoffTs)
          .limit(200)
          .get(),
        db
          .collection("bookings")
          .where("status", "==", "final_failed")
          .where("updatedAt", "<=", cutoffTs)
          .limit(200)
          .get(),
      ]);
      const staleFailedDocs = new Map<string, QueryDocumentSnapshot<DocumentData>>();
      for (const doc of staleByFinalChargeAtSnap.docs) staleFailedDocs.set(doc.id, doc);
      for (const doc of staleByUpdatedAtSnap.docs) staleFailedDocs.set(doc.id, doc);
      for (const doc of staleFailedDocs.values()) {
        const b = doc.data() as Booking;
        if (!b.finalChargeAt) {
          await writeOperationalAlert({
            type: "final_failed_missing_final_charge_at",
            source: "run-final-charges",
            bookingId: doc.id,
            slotId: b.slotId ?? null,
            boatId: b.boatId ?? null,
            experienceId: b.experienceId ?? null,
            hint: "Booking is final_failed without finalChargeAt; fallback updatedAt auto-cancel path was used.",
          }).catch(() => {});
        }
        try {
          await db.runTransaction(async (tx) => {
            const ref = db.collection("bookings").doc(doc.id);
            const snap = await tx.get(ref);
            if (!snap.exists) return;
            const fresh = snap.data() as Booking;
            if (fresh.status !== "final_failed") return;
            tx.update(ref, { status: "canceled", updatedAt: FieldValue.serverTimestamp() });
            await resetBookingSlotsToOpenInTransaction(db, tx, doc.id, fresh);
          });
          await writeOperationalAlert({
            type: "final_failed_auto_canceled",
            source: "run-final-charges",
            bookingId: doc.id,
            autoCancelGraceHours: FINAL_FAILED_GRACE_HOURS,
            slotId: b.slotId ?? null,
            boatId: b.boatId ?? null,
            experienceId: b.experienceId ?? null,
          });
        } catch (bookingAutoCancelErr) {
          await writeOperationalAlert({
            type: "final_failed_auto_cancel_booking_error",
            source: "run-final-charges",
            bookingId: doc.id,
            error:
              bookingAutoCancelErr instanceof Error
                ? bookingAutoCancelErr.message
                : String(bookingAutoCancelErr),
          }).catch(() => {});
        }
      }
    } catch (finalFailedAutoCancelErr) {
      await writeOperationalAlert({
        type: "final_failed_auto_cancel_error",
        source: "run-final-charges",
        error:
          finalFailedAutoCancelErr instanceof Error
            ? finalFailedAutoCancelErr.message
            : String(finalFailedAutoCancelErr),
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, matched, processed, attempted, successCount, skipped, failed, errors });
  } catch (err) {
    console.error("[admin/cron/run-final-charges]", err);
    return NextResponse.json({ error: "Final charge run failed" }, { status: 500 });
  }
}
