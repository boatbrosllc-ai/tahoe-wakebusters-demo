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
  finalChargeAtSecondsFromBooking,
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
import { verifyIndexedStripeCustomerOrClear } from "@/lib/booking/stripe-customer-index";
import {
  persistFinalBalanceNormalizationIfNeeded,
  resolveFinalBalanceFromBooking,
} from "@/lib/booking/final-balance-resolver";
import { resetBookingSlotsToOpenInTransaction } from "@/lib/booking/slot-reset";
import { transitionBookingStatus } from "@/lib/booking/transition-booking-status";
import { resetBookingToFinalDue, transitionToFinalPaid } from "@/lib/booking/final-paid-transition";
import { resolveExperienceDocAndSlug } from "@/lib/booking/listing-boat-resolution";
import { upsertPendingRefundRecord } from "@/lib/booking/pending-refund-idempotent";
import { parseSlotId, getSlotStartEnd } from "@/lib/booking/experience-slots";

const PAGE_SIZE = 100;
/** After a failed final charge, extend the lock briefly so a concurrent cron pass cannot slip in before the next scheduled run. */
const FINAL_CHARGE_FAILURE_LOCK_EXTENSION_MS = 2 * 60 * 1000;
const FINAL_FAILED_GRACE_HOURS = (() => {
  const n = parseInt(process.env.FINAL_FAILED_GRACE_HOURS ?? "72", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 24 * 30) : 72;
})();
const FINAL_REQUIRES_ACTION_RELEASE_HOURS = (() => {
  const n = parseInt(process.env.FINAL_REQUIRES_ACTION_RELEASE_HOURS ?? "48", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 24 * 30) : 48;
})();
const FINAL_MISSING_STRIPE_DATA_GRACE_DAYS = (() => {
  const n = parseInt(process.env.FINAL_MISSING_STRIPE_DATA_GRACE_DAYS ?? "7", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 90) : 7;
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

async function collectStaleBookingsByTimestampField(
  db: ReturnType<typeof getDb>,
  status: Booking["status"],
  fieldPath: string,
  cutoffTs: ReturnType<ReturnType<typeof getFirestoreExports>["Timestamp"]["fromDate"]>,
): Promise<Map<string, QueryDocumentSnapshot<DocumentData>>> {
  const out = new Map<string, QueryDocumentSnapshot<DocumentData>>();
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
  while (true) {
    let q = db
      .collection("bookings")
      .where("status", "==", status)
      .where(fieldPath, "<=", cutoffTs)
      .orderBy(fieldPath, "asc")
      .limit(PAGE_SIZE);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) out.set(doc.id, doc);
    if (snap.size < PAGE_SIZE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return out;
}

/** Escape single quotes for Stripe PaymentIntent search query literals. */
function stripeSearchQuote(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Stripe succeeded final PI exists for this booking but Firestore may not reference it — reconcile instead of creating a duplicate charge. */
async function findOrphanedSucceededFinalPaymentIntent(
  stripe: Stripe,
  bookingId: string
): Promise<Stripe.PaymentIntent | null> {
  try {
    const q = `metadata['bookingId']:'${stripeSearchQuote(bookingId)}' AND metadata['payment_stage']:'final' AND status:'succeeded'`;
    const res = await stripe.paymentIntents.search({ query: q, limit: 5 });
    const hit = res.data.find((p) => p.status === "succeeded");
    return hit ?? null;
  } catch (e) {
    bookingWarn("run-final-charges", "orphaned final PI search failed", {
      bookingId,
      err: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
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
    bookingError("run-final-charges", "recovery update failed after Firestore error post-PI", lastRecoveryErr);
  }
  try {
    await bookingRef.update({
      "stripe.pendingChargePiId": pi.id,
      updatedAt: Timestamp.now(),
    });
  } catch (pendingErr) {
    await writeOperationalAlert({
      type: "final_charge_pending_charge_pi_id_persist_failed",
      severity: "critical",
      bookingId: bookingRef.id,
      paymentIntentId: pi.id,
      piStatus: pi.status,
      source: "run-final-charges",
      phase: "recover_final_charge_after_firestore_failure",
      mainRecoveryUpdateFailed: lastRecoveryErr != null,
      errorMessage: pendingErr instanceof Error ? pendingErr.message : String(pendingErr),
    });
  }
  await writeOperationalAlert({
    type: "final_charge_firestore_persist_failed_after_pi_created",
    severity: "critical",
    bookingId: bookingRef.id,
    paymentIntentId: pi.id,
    piStatus: pi.status,
    source: "run-final-charges",
    phase: "final_due_create_pi",
    errorMessage: fsErr instanceof Error ? fsErr.message : String(fsErr),
    ...(lastRecoveryErr != null
      ? {
          mainRecoveryUpdateError:
            lastRecoveryErr instanceof Error ? lastRecoveryErr.message : String(lastRecoveryErr),
        }
      : {}),
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
              const finalRev = typeof sb?.finalAmountCents === "number" ? sb.finalAmountCents : 0;
              const authoritativeFinalCents =
                finalRev > 0 ? finalRev : resolveFinalBalanceFromBooking(b).authoritativeFinalCents;
              if (isDepositFlow && finalRev <= 0) {
                depositFlowMissingAuthoritativeRevenue = true;
              }
              // Monthly revenue bucket comes from booking.summaryMonthKey (or createdAt) inside transitionToFinalPaid, not cron run time.
              await transitionToFinalPaid(
                tx,
                db,
                ref,
                b,
                bookingId,
                existingFinalPiId,
                FieldValue,
                Timestamp,
                authoritativeFinalCents
              );
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
            bookingLog("run-final-charges", "reconciled final_processing → final_paid", {
              bookingId,
              paymentIntentId: existingFinalPiId,
            });
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
              resetBookingToFinalDue(tx, ref, FieldValue, Timestamp);
              resetApplied = true;
            });
            if (!resetApplied) {
              continue;
            }
            bookingLog("run-final-charges", "stale final_processing intent recovery", {
              bookingId,
              paymentIntentId: existingFinalPiId,
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
            bookingLog("run-final-charges", "reconciled final_processing → final_due (stale intent cleared)", {
              bookingId,
              paymentIntentId: existingFinalPiId,
              piStatus,
            });
            continue;
          }
          if (piStatus === "requires_action") {
            await transitionBookingStatus(db, bookingId, "final_processing", "final_requires_action", {
              transitionSource: "cron:run-final-charges",
            });
            bookingLog("run-final-charges", "reconciled final_processing → final_requires_action", {
              bookingId,
              paymentIntentId: existingFinalPiId,
            });
            continue;
          }
          // processing: leave as final_processing; will reconcile on a later run when succeeded.
        } catch (retrieveErr: unknown) {
          const err = retrieveErr as { code?: string; message?: string; type?: string };
          bookingError("run-final-charges", "reconcile final_processing: PaymentIntent retrieve failed", retrieveErr, {
            bookingId,
            paymentIntentId: existingFinalPiId,
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
              resetBookingToFinalDue(tx, ref, FieldValue, Timestamp);
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
            bookingError("run-final-charges", "waiver block alert/update failed", waiverBlockErr, { bookingId });
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
              const finalRev = typeof sb?.finalAmountCents === "number" ? sb.finalAmountCents : 0;
              const authoritativeFinalCents =
                finalRev > 0 ? finalRev : resolveFinalBalanceFromBooking(b).authoritativeFinalCents;
              if (isDepositFlow && finalRev <= 0) {
                depositFlowMissingAuthoritativeRevenueReconcile = true;
              }
              await transitionToFinalPaid(
                tx,
                db,
                bookingRef,
                b,
                bookingId,
                existingFinalPiId,
                FieldValue,
                Timestamp,
                authoritativeFinalCents
              );
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
              paymentIntentId: existingFinalPiId,
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
              paymentIntentId: existingFinalPiId,
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
            } else {
              await writeOperationalAlert({
                type: "final_charge_pi_retrieve_transient_error",
                bookingId,
                paymentIntentId: existingFinalPiId,
                phase: "final_due_loop",
                source: "run-final-charges",
                skipped: true,
                code: err.code,
                message: err.message,
              });
              skipped++;
              continue;
            }
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
                  if (paymentMethodId) {
                    try {
                      const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
                      const pmCustomerId =
                        typeof pm.customer === "string"
                          ? pm.customer
                          : pm.customer && typeof pm.customer === "object" && "id" in pm.customer
                            ? (pm.customer as Stripe.Customer).id
                            : null;
                      if (pmCustomerId && pmCustomerId !== listedId) {
                        await writeOperationalAlert({
                          type: "final_charge_customer_recovery_pm_mismatch",
                          bookingId,
                          source: "run-final-charges",
                          listedCustomerId: listedId,
                          paymentMethodCustomerId: pmCustomerId,
                          paymentMethodId,
                        });
                        failed++;
                        errors.push(`${bookingId}: customer recovery email list vs payment method customer mismatch`);
                        continue;
                      }
                    } catch (pmVerifyErr) {
                      await writeOperationalAlert({
                        type: "final_charge_customer_recovery_pm_verify_failed",
                        bookingId,
                        source: "run-final-charges",
                        paymentMethodId,
                        listedCustomerId: listedId,
                        error: pmVerifyErr instanceof Error ? pmVerifyErr.message : String(pmVerifyErr),
                      });
                      failed++;
                      errors.push(`${bookingId}: customer recovery payment method verify failed`);
                      continue;
                    }
                  }
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
        if (!customerId || authoritativeFinalCents <= 0) {
          bookingWarn("run-final-charges", "booking missing customerId or zero final balance", { bookingId });
          const missingFields: string[] = [];
          if (!customerId) missingFields.push("stripe.customerId");
          if (authoritativeFinalCents <= 0) missingFields.push("final_balance_from_totals");
          await writeOperationalAlert({
            type: "final_charge_missing_stripe_data",
            bookingId,
            details: { missingFields },
            source: "run-final-charges",
          });
          if (!customerId) {
            await writeOperationalAlert({
              type: "final_charge_missing_stripe_data_manual_customer_id_reconcile",
              severity: "critical",
              bookingId,
              source: "run-final-charges",
              paymentMethodIdOnBooking: paymentMethodId ?? null,
              message:
                "Set booking.stripe.customerId on the Firestore booking to the Stripe customer id that owns stripe.paymentMethodId (Stripe Dashboard → Payment Methods → open the PM → Customer).",
            });
          }
          if (!customerId) {
            const missingStripeFailureSentinelPiId = `missing_pm_${bookingId}`;
            const shouldSend = await tryBeginFinalFailureNotificationSend(
              db,
              bookingId,
              missingStripeFailureSentinelPiId
            );
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
                let experienceNameMissing = "Your trip";
                if (booking.experienceId) {
                  const exMissing = await db.collection("experiences").doc(booking.experienceId).get();
                  if (exMissing.exists) {
                    experienceNameMissing =
                      (exMissing.data() as { title?: string }).title ?? experienceNameMissing;
                  }
                }
                let tripDateMissing = booking.startDateStr ?? "";
                let startTimeMissing = "";
                if (booking.slotId) {
                  const parsedMissing = parseSlotId(booking.slotId.trim());
                  if (parsedMissing) {
                    const tripStartMissing = getSlotStartEnd(
                      parsedMissing.dateStr,
                      parsedMissing.startHour,
                      parsedMissing.durationHours ?? 2,
                      parsedMissing.startMinute ?? 0
                    ).start;
                    tripDateMissing = tripStartMissing.toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      timeZone: "America/Chicago",
                    });
                    startTimeMissing = tripStartMissing.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone: "America/Chicago",
                    });
                  }
                }
                await sendFinalChargeFailedEmail(
                  booking.customer.email,
                  booking.customer.name,
                  manageLink,
                  true,
                  {
                    experienceName: experienceNameMissing,
                    tripDate: tripDateMissing,
                    startTime: startTimeMissing,
                  }
                );
                await logNotificationSent({
                  channel: "email",
                  to: booking.customer.email,
                  toName: booking.customer.name,
                  templateId: "final_charge_failed",
                  subject: "Action needed: update your payment method to keep your booking",
                  bookingId,
                  eventSubtype: "final_charge_failed_missing_payment_method",
                }).catch((logErr) =>
                  bookingError("run-final-charges", "logNotificationSent failed", logErr, { bookingId })
                );
                await finalizeFinalFailureNotification(
                  db,
                  bookingId,
                  missingStripeFailureSentinelPiId
                );
              } catch (emailErr) {
                bookingError("run-final-charges", "sendFinalChargeFailedEmail failed", emailErr, { bookingId });
                await clearFinalFailureNotificationLease(db, bookingId).catch((clearErr) =>
                  bookingError("run-final-charges", "clearFinalFailureNotificationLease failed", clearErr, { bookingId })
                );
              }
            }
          }
          errors.push(`${bookingId}: missing stripe data`);
          failed++;
          continue;
        }

        type LockTxResult =
          | { acquired: true; freshPaymentMethodId: string }
          | { acquired: false; reason: string };
        let paymentMethodIdForCharge: string;
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
            const freshPaymentMethodId =
              typeof b.stripe?.paymentMethodId === "string" && b.stripe.paymentMethodId.trim()
                ? b.stripe.paymentMethodId.trim()
                : undefined;
            if (!freshPaymentMethodId) {
              return { acquired: false, reason: "missing_pm" };
            }
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
            return { acquired: true, freshPaymentMethodId };
          });
          if (!txResult.acquired) {
            if (txResult.reason === "missing_pm") {
              bookingWarn("run-final-charges", "booking missing paymentMethodId (transactional read; lock not taken)", {
                bookingId,
              });
              const missingFields = ["stripe.paymentMethodId"];
              await writeOperationalAlert({
                type: "final_charge_missing_stripe_data",
                bookingId,
                details: { missingFields },
                source: "run-final-charges",
              });
              const missingStripeFailureSentinelPiId = `missing_pm_${bookingId}`;
              const shouldSend = await tryBeginFinalFailureNotificationSend(
                db,
                bookingId,
                missingStripeFailureSentinelPiId
              );
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
                  let experienceNameMissing = "Your trip";
                  if (booking.experienceId) {
                    const exMissing = await db.collection("experiences").doc(booking.experienceId).get();
                    if (exMissing.exists) {
                      experienceNameMissing =
                        (exMissing.data() as { title?: string }).title ?? experienceNameMissing;
                    }
                  }
                  let tripDateMissing = booking.startDateStr ?? "";
                  let startTimeMissing = "";
                  if (booking.slotId) {
                    const parsedMissing = parseSlotId(booking.slotId.trim());
                    if (parsedMissing) {
                      const tripStartMissing = getSlotStartEnd(
                        parsedMissing.dateStr,
                        parsedMissing.startHour,
                        parsedMissing.durationHours ?? 2,
                        parsedMissing.startMinute ?? 0
                      ).start;
                      tripDateMissing = tripStartMissing.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "America/Chicago",
                      });
                      startTimeMissing = tripStartMissing.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: "America/Chicago",
                      });
                    }
                  }
                  await sendFinalChargeFailedEmail(
                    booking.customer.email,
                    booking.customer.name,
                    manageLink,
                    true,
                    {
                      experienceName: experienceNameMissing,
                      tripDate: tripDateMissing,
                      startTime: startTimeMissing,
                    }
                  );
                  await logNotificationSent({
                    channel: "email",
                    to: booking.customer.email,
                    toName: booking.customer.name,
                    templateId: "final_charge_failed",
                    subject: "Action needed: update your payment method to keep your booking",
                    bookingId,
                    eventSubtype: "final_charge_failed_missing_payment_method",
                  }).catch((logErr) =>
                    bookingError("run-final-charges", "logNotificationSent failed", logErr, { bookingId })
                  );
                  await finalizeFinalFailureNotification(
                    db,
                    bookingId,
                    missingStripeFailureSentinelPiId
                  );
                } catch (emailErr) {
                  bookingError("run-final-charges", "sendFinalChargeFailedEmail failed", emailErr, { bookingId });
                  await clearFinalFailureNotificationLease(db, bookingId).catch((clearErr) =>
                    bookingError("run-final-charges", "clearFinalFailureNotificationLease failed", clearErr, { bookingId })
                  );
                }
              }
              errors.push(`${bookingId}: missing payment method (transactional)`);
              failed++;
              continue;
            }
            skipped++;
            continue;
          }
          paymentMethodIdForCharge = txResult.freshPaymentMethodId;
        } catch (txErr) {
          bookingWarn("run-final-charges", "lock transaction failed", { bookingId, err: txErr });
          skipped++;
          continue;
        }

        const resolutionBeforeFinalPi = resolveFinalBalanceFromBooking(booking);
        if (resolutionBeforeFinalPi.isDepositAmountMissing) {
          await writeOperationalAlert({
            type: "final_charge_blocked_missing_deposit_amount_cents",
            bookingId,
            source: "run-final-charges",
            depositPaymentIntentId: booking.stripe?.depositPaymentIntentId ?? null,
            depositAmountCents: resolutionBeforeFinalPi.depositAmountCents,
          });
          await db.collection("bookings").doc(bookingId).update({
            "stripe.finalChargeLockAt": FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          failed++;
          errors.push(`${bookingId}: deposit amount missing for deposit booking`);
          continue;
        }

        const orphanSucceededFinalPi = await findOrphanedSucceededFinalPaymentIntent(stripe, bookingId);
        if (orphanSucceededFinalPi) {
          const orphanPiId = orphanSucceededFinalPi.id;
          const bookingRefOrphan = db.collection("bookings").doc(bookingId);
          let orphanReconcileOk = false;
          let depositFlowMissingAuthoritativeRevenueOrphan = false;
          try {
            await db.runTransaction(async (tx) => {
              const snap = await tx.get(bookingRefOrphan);
              if (!snap.exists) return;
              const b = snap.data() as Booking;
              if (b.status === "final_paid" && b.stripe?.finalChargedAt) {
                return;
              }
              const sb = b.stripe;
              const isDepositFlow = typeof sb?.depositAmountCents === "number";
              const finalRev =
                typeof sb?.finalAmountCents === "number" && sb.finalAmountCents > 0 ? sb.finalAmountCents : 0;
              const authoritativeFinalCentsOrphan =
                finalRev > 0 ? finalRev : resolveFinalBalanceFromBooking(b).authoritativeFinalCents;
              if (isDepositFlow && finalRev <= 0) {
                depositFlowMissingAuthoritativeRevenueOrphan = true;
              }
              await transitionToFinalPaid(
                tx,
                db,
                bookingRefOrphan,
                b,
                bookingId,
                orphanPiId,
                FieldValue,
                Timestamp,
                authoritativeFinalCentsOrphan
              );
            });
            orphanReconcileOk = true;
          } catch (orphanReconcileErr) {
            bookingError("run-final-charges", "orphan succeeded final PI reconcile failed", orphanReconcileErr, {
              bookingId,
              paymentIntentId: orphanPiId,
            });
            await writeOperationalAlert({
              type: "final_charge_orphan_pi_reconcile_failed",
              severity: "critical",
              bookingId,
              paymentIntentId: orphanPiId,
              source: "run-final-charges",
              errorMessage: orphanReconcileErr instanceof Error ? orphanReconcileErr.message : String(orphanReconcileErr),
            });
          }
          await db.collection("bookings").doc(bookingId).update({
            "stripe.finalChargeLockAt": FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          if (orphanReconcileOk) {
            if (depositFlowMissingAuthoritativeRevenueOrphan) {
              const piAmt = typeof orphanSucceededFinalPi.amount === "number" ? orphanSucceededFinalPi.amount : 0;
              await alertIfPiAmountDiffersFromBookingExpected(bookingId, piAmt, booking, "orphan_succeeded_final_pi_search");
              await writeOperationalAlert({
                type: "final_charge_revenue_manual_reconciliation_required",
                bookingId,
                paymentIntentId: orphanPiId,
                source: "run-final-charges",
                phase: "orphan_succeeded_final_pi_search",
                reason: "deposit_flow_missing_total_or_deposit_cents",
              });
            }
            await writeOperationalAlert({
              type: "final_charge_reconciled_orphan_succeeded_pi",
              bookingId,
              paymentIntentId: orphanPiId,
              source: "run-final-charges",
            });
            attempted++;
            successCount++;
          } else {
            failed++;
            errors.push(`${bookingId}: orphan succeeded final PI reconcile failed`);
          }
          continue;
        }

        let pi: Stripe.PaymentIntent;
        try {
          pi = await stripe.paymentIntents.create(
            {
              amount: authoritativeFinalCents,
              currency: "usd",
              customer: customerId,
              payment_method: paymentMethodIdForCharge,
              off_session: true,
              confirm: true,
              metadata: { bookingId, payment_stage: "final" },
            },
            {
              idempotencyKey: getFinalChargeIdempotencyKey(
                bookingId,
                "cron",
                undefined,
                authoritativeFinalCents,
                finalChargeAtSecondsFromBooking(booking)
              ),
            }
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
            bookingLog("run-final-charges", "idempotency conflict — lock cleared, staying final_due for retry", {
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
          const failureLockUntil = Timestamp.fromDate(
            new Date(Date.now() + FINAL_CHARGE_FAILURE_LOCK_EXTENSION_MS)
          );
          await db.collection("bookings").doc(bookingId).update({
            status: newStatus,
            ...(failedPiId ? { "stripe.finalPaymentIntentId": failedPiId } : {}),
            "stripe.finalError": { code, message: err.message ?? undefined },
            "stripe.finalChargeLockAt": failureLockUntil,
            updatedAt: FieldValue.serverTimestamp(),
          });
          bookingLog("run-final-charges", "final charge failed, lock extended, status updated", {
            bookingId,
            newStatus,
            code,
          });
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
              let experienceNameFc = "Your trip";
              if (booking.experienceId) {
                const exFc = await db.collection("experiences").doc(booking.experienceId).get();
                if (exFc.exists) experienceNameFc = (exFc.data() as { title?: string }).title ?? experienceNameFc;
              }
              let tripDateFc = booking.startDateStr ?? "";
              let startTimeFc = "";
              if (booking.slotId) {
                const parsedFc = parseSlotId(booking.slotId.trim());
                if (parsedFc) {
                  const tripStartFc = getSlotStartEnd(
                    parsedFc.dateStr,
                    parsedFc.startHour,
                    parsedFc.durationHours ?? 2,
                    parsedFc.startMinute ?? 0,
                  ).start;
                  tripDateFc = tripStartFc.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "America/Chicago",
                  });
                  startTimeFc = tripStartFc.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: "America/Chicago",
                  });
                }
              }
              const subject = requiresAction ? "Action needed to complete your booking – Boat Bros ATX" : "Payment failed for your upcoming trip – Boat Bros ATX";
              await sendFinalChargeFailedEmail(booking.customer.email, booking.customer.name, manageLink, requiresAction, {
                experienceName: experienceNameFc,
                tripDate: tripDateFc,
                startTime: startTimeFc,
              });
              await logNotificationSent({
                channel: "email",
                to: booking.customer.email,
                toName: booking.customer.name,
                templateId: "final_charge_failed",
                subject,
                bookingId,
                eventSubtype: "final_charge_failed",
              }).catch((logErr) => bookingError("run-final-charges", "logNotificationSent failed", logErr, { bookingId }));
              await finalizeFinalFailureNotification(db, bookingId, failedPiId);
            } catch (emailErr) {
              bookingError("run-final-charges", "sendFinalChargeFailedEmail failed", emailErr, { bookingId });
              await clearFinalFailureNotificationLease(db, bookingId).catch((clearErr) =>
                bookingError("run-final-charges", "clearFinalFailureNotificationLease failed", clearErr, { bookingId })
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
              const finalRev =
                typeof sb?.finalAmountCents === "number" && sb.finalAmountCents > 0 ? sb.finalAmountCents : 0;
              const authoritativeFinalCents =
                finalRev > 0 ? finalRev : resolveFinalBalanceFromBooking(b).authoritativeFinalCents;
              if (isDepositFlow && finalRev <= 0) {
                depositFlowMissingAuthoritativeRevenueCreate = true;
              }
              await transitionToFinalPaid(
                tx,
                db,
                bookingRef,
                b,
                bookingId,
                pi.id,
                FieldValue,
                Timestamp,
                authoritativeFinalCents
              );
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
            // Non-succeeded PI (e.g. processing): persist id + final_processing atomically after re-read. Failures hit
            // the same catch as the succeeded transaction path and call recoverFinalChargeAfterFirestorePersistFailure
            // so the next run reconciles via existing PI instead of creating another charge.
            const finalProcessingRaceRefundPiId = await db.runTransaction(async (tx): Promise<string | null> => {
              const snap = await tx.get(bookingRef);
              if (!snap.exists) {
                bookingWarn("run-final-charges", "final_processing: booking doc missing after PI create", {
                  bookingId,
                  paymentIntentId: pi.id,
                });
                return pi.id;
              }
              const b = snap.data() as Booking;
              if (b.status !== "final_due") {
                bookingWarn("run-final-charges", "final_processing race: booking not final_due after PI create", {
                  bookingId,
                  observedStatus: b.status,
                  paymentIntentId: pi.id,
                });
                return pi.id;
              }
              tx.update(bookingRef, {
                "stripe.finalPaymentIntentId": pi.id,
                status: "final_processing",
                updatedAt: FieldValue.serverTimestamp(),
              });
              return null;
            });
            if (finalProcessingRaceRefundPiId) {
              try {
                await upsertPendingRefundRecord(
                  db,
                  {
                    reason: "final_processing_status_race_or_missing_booking",
                    bookingId,
                    paymentIntentId: finalProcessingRaceRefundPiId,
                  },
                  {
                    bookingId,
                    paymentIntentId: finalProcessingRaceRefundPiId,
                    ...(typeof booking.customer?.email === "string" && booking.customer.email.trim()
                      ? { customerEmail: booking.customer.email.trim() }
                      : {}),
                  }
                );
              } catch (prErr) {
                bookingWarn("run-final-charges", "upsert pending refund after final_processing race failed", {
                  bookingId,
                  err: prErr,
                });
              }
            }
          }
        } catch (fsErr: unknown) {
          const fsMsg = fsErr instanceof Error ? fsErr.message : String(fsErr);
          if (fsMsg.includes("Illegal booking status transition")) {
            throw fsErr;
          }
          bookingError("run-final-charges", "Firestore persist failed after Stripe PI create", fsErr, { bookingId });
          await recoverFinalChargeAfterFirestorePersistFailure(bookingRef, pi, fsErr);
          attempted++;
          successCount++;
          continue;
        }

        if (isSucceeded) {
          bookingLog("run-final-charges", "PaymentIntent succeeded immediately (final_paid persisted)", {
            bookingId,
            paymentIntentId: pi.id,
          });
        } else {
          bookingLog("run-final-charges", "PaymentIntent created (webhook will set final_paid)", {
            bookingId,
            paymentIntentId: pi.id,
          });
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
      bookingError("run-final-charges", "orphaned pendingRefunds scan failed", orphanErr);
    }

    // Auto-cancel final_due bookings past finalChargeAt that still cannot be charged (missing Stripe customer / PM).
    try {
      const msCutoff = new Date(Date.now() - FINAL_MISSING_STRIPE_DATA_GRACE_DAYS * 86400000);
      const msCutoffTs = Timestamp.fromDate(msCutoff);
      const stuckMissingStripeSnap = await db
        .collection("bookings")
        .where("status", "==", "final_due")
        .where("finalChargeAt", "<=", msCutoffTs)
        .limit(150)
        .get();
      for (const doc of stuckMissingStripeSnap.docs) {
        const b = doc.data() as Booking;
        const customerIdEarly = b.stripe?.customerId?.trim();
        const pmEarly = b.stripe?.paymentMethodId?.trim();
        if (customerIdEarly && pmEarly) continue;
        const bookingRefMs = db.collection("bookings").doc(doc.id);
        const { authoritativeFinalCents } = await persistFinalBalanceNormalizationIfNeeded(bookingRefMs, b, {
          bookingId: doc.id,
          source: "run-final-charges-missing-stripe-cancel",
        });
        if (authoritativeFinalCents <= 0) continue;
        try {
          await db.runTransaction(async (tx) => {
            const ref = db.collection("bookings").doc(doc.id);
            const snap = await tx.get(ref);
            if (!snap.exists) return;
            const fresh = snap.data() as Booking;
            if (fresh.status !== "final_due") return;
            const cId = fresh.stripe?.customerId?.trim();
            const pId = fresh.stripe?.paymentMethodId?.trim();
            if (cId && pId) return;
            const expResolved = await resolveExperienceDocAndSlug(db, fresh.experienceId);
            const bookingForReset = expResolved ? ({ ...fresh, experienceId: expResolved.docId } as Booking) : fresh;
            await resetBookingSlotsToOpenInTransaction(
              db,
              tx,
              doc.id,
              bookingForReset,
              expResolved?.slug ?? ""
            );
            tx.update(ref, { status: "canceled", updatedAt: FieldValue.serverTimestamp() });
          });
          const depPi = typeof b.stripe?.depositPaymentIntentId === "string" ? b.stripe.depositPaymentIntentId.trim() : "";
          const fullPi = typeof b.stripe?.paymentIntentId === "string" ? b.stripe.paymentIntentId.trim() : "";
          const piQueueMs = new Set<string>();
          if (depPi) piQueueMs.add(depPi);
          if (fullPi) piQueueMs.add(fullPi);
          for (const paymentIntentId of Array.from(piQueueMs)) {
            try {
              await upsertPendingRefundRecord(
                db,
                {
                  reason: "final_missing_stripe_auto_canceled_deposit_refund",
                  bookingId: doc.id,
                  paymentIntentId,
                },
                {
                  bookingId: doc.id,
                  paymentIntentId,
                  ...(typeof b.customer?.email === "string" && b.customer.email.trim()
                    ? { customerEmail: b.customer.email.trim() }
                    : {}),
                }
              );
            } catch (prErr) {
              bookingWarn("run-final-charges", "upsert pending refund after missing-stripe auto-cancel failed", {
                bookingId: doc.id,
                err: prErr,
              });
            }
          }
          await writeOperationalAlert({
            type: "final_due_missing_stripe_auto_canceled",
            source: "run-final-charges",
            bookingId: doc.id,
            graceDays: FINAL_MISSING_STRIPE_DATA_GRACE_DAYS,
            pendingRefundPaymentIntentsQueued: Array.from(piQueueMs),
            slotId: b.slotId ?? null,
            boatId: b.boatId ?? null,
            experienceId: b.experienceId ?? null,
          }).catch(() => {});
          const emailMs = b.customer?.email?.trim();
          if (emailMs) {
            try {
              const { sendBookingCancellationEmail } = await import("@/lib/booking/brevo");
              let experienceNameMs = "Your trip";
              if (b.experienceId) {
                const ex = await db.collection("experiences").doc(b.experienceId).get();
                if (ex.exists) experienceNameMs = (ex.data() as { title?: string }).title ?? experienceNameMs;
              }
              await sendBookingCancellationEmail({
                to: emailMs,
                customerName: b.customer?.name ?? "Guest",
                experienceName: experienceNameMs,
                tripDate: b.startDateStr,
                refundPending: piQueueMs.size > 0,
                refundOutcome: piQueueMs.size > 0 ? "pending" : "skipped",
              });
            } catch (mailErr) {
              bookingWarn("run-final-charges", "cancellation email after missing-stripe auto-cancel failed", {
                bookingId: doc.id,
                err: mailErr,
              });
            }
          }
        } catch (msCancelErr) {
          await writeOperationalAlert({
            type: "final_due_missing_stripe_auto_cancel_error",
            source: "run-final-charges",
            bookingId: doc.id,
            error: msCancelErr instanceof Error ? msCancelErr.message : String(msCancelErr),
          }).catch(() => {});
        }
      }
    } catch (missingStripeCancelScanErr) {
      await writeOperationalAlert({
        type: "final_due_missing_stripe_auto_cancel_scan_error",
        source: "run-final-charges",
        error:
          missingStripeCancelScanErr instanceof Error
            ? missingStripeCancelScanErr.message
            : String(missingStripeCancelScanErr),
      }).catch(() => {});
    }

    // Auto-cancel long-stuck final_failed bookings so slots are eventually released.
    try {
      const cutoff = new Date(Date.now() - FINAL_FAILED_GRACE_HOURS * 60 * 60 * 1000);
      const cutoffTs = Timestamp.fromDate(cutoff);
      const [staleByFinalChargeAt, staleByUpdatedAt] = await Promise.all([
        collectStaleBookingsByTimestampField(db, "final_failed", "finalChargeAt", cutoffTs),
        collectStaleBookingsByTimestampField(db, "final_failed", "updatedAt", cutoffTs),
      ]);
      const staleFailedDocs = new Map<string, QueryDocumentSnapshot<DocumentData>>();
      for (const [id, doc] of staleByFinalChargeAt) staleFailedDocs.set(id, doc);
      for (const [id, doc] of staleByUpdatedAt) staleFailedDocs.set(id, doc);
      for (const doc of Array.from(staleFailedDocs.values())) {
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
            const expResolved = await resolveExperienceDocAndSlug(db, fresh.experienceId);
            const bookingForReset = expResolved ? ({ ...fresh, experienceId: expResolved.docId } as Booking) : fresh;
            await resetBookingSlotsToOpenInTransaction(
              db,
              tx,
              doc.id,
              bookingForReset,
              expResolved?.slug ?? ""
            );
            tx.update(ref, { status: "canceled", updatedAt: FieldValue.serverTimestamp() });
          });
          const depPiFf = typeof b.stripe?.depositPaymentIntentId === "string" ? b.stripe.depositPaymentIntentId.trim() : "";
          const fullPiFf = typeof b.stripe?.paymentIntentId === "string" ? b.stripe.paymentIntentId.trim() : "";
          const piQueueFf = new Set<string>();
          if (depPiFf) piQueueFf.add(depPiFf);
          if (fullPiFf) piQueueFf.add(fullPiFf);
          for (const paymentIntentId of Array.from(piQueueFf)) {
            try {
              await upsertPendingRefundRecord(
                db,
                {
                  reason: "final_failed_auto_canceled_deposit_refund",
                  bookingId: doc.id,
                  paymentIntentId,
                },
                {
                  bookingId: doc.id,
                  paymentIntentId,
                  ...(typeof b.customer?.email === "string" && b.customer.email.trim()
                    ? { customerEmail: b.customer.email.trim() }
                    : {}),
                }
              );
            } catch (prErr) {
              bookingWarn("run-final-charges", "upsert pending refund after final_failed auto-cancel failed", {
                bookingId: doc.id,
                err: prErr,
              });
            }
          }
          await writeOperationalAlert({
            type: "final_failed_auto_canceled",
            source: "run-final-charges",
            bookingId: doc.id,
            autoCancelGraceHours: FINAL_FAILED_GRACE_HOURS,
            pendingRefundPaymentIntentsQueued: Array.from(piQueueFf),
            slotId: b.slotId ?? null,
            boatId: b.boatId ?? null,
            experienceId: b.experienceId ?? null,
          });
          const emailFf = b.customer?.email?.trim();
          if (emailFf) {
            try {
              const { sendBookingCancellationEmail } = await import("@/lib/booking/brevo");
              let experienceNameFf = "Your trip";
              if (b.experienceId) {
                const ex = await db.collection("experiences").doc(b.experienceId).get();
                if (ex.exists) experienceNameFf = (ex.data() as { title?: string }).title ?? experienceNameFf;
              }
              await sendBookingCancellationEmail({
                to: emailFf,
                customerName: b.customer?.name ?? "Guest",
                experienceName: experienceNameFf,
                tripDate: b.startDateStr,
                refundPending: piQueueFf.size > 0,
                refundOutcome: piQueueFf.size > 0 ? "pending" : "skipped",
              });
            } catch (mailErr) {
              bookingWarn("run-final-charges", "cancellation email after final_failed auto-cancel failed", {
                bookingId: doc.id,
                err: mailErr,
              });
            }
          }
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

    // Auto-release long-stuck final_requires_action bookings by transitioning to final_failed
    // so the existing reconcile-final-failed-bookings cron can release inventory.
    try {
      const raCutoff = new Date(Date.now() - FINAL_REQUIRES_ACTION_RELEASE_HOURS * 60 * 60 * 1000);
      const raCutoffTs = Timestamp.fromDate(raCutoff);
      const [staleByAttemptedAt, staleByUpdatedAt] = await Promise.all([
        collectStaleBookingsByTimestampField(
          db,
          "final_requires_action",
          "stripe.finalChargeAttemptedAt",
          raCutoffTs
        ),
        collectStaleBookingsByTimestampField(db, "final_requires_action", "updatedAt", raCutoffTs),
      ]);
      const raDocs = new Map<string, QueryDocumentSnapshot<DocumentData>>();
      for (const [id, doc] of staleByAttemptedAt) raDocs.set(id, doc);
      for (const [id, doc] of staleByUpdatedAt) raDocs.set(id, doc);
      for (const doc of Array.from(raDocs.values())) {
        const b = doc.data() as Booking;
        try {
          const result = await transitionBookingStatus(
            db,
            doc.id,
            "final_requires_action",
            "final_failed",
            { transitionSource: "final_requires_action_auto_release" },
          );
          if (!result.ok && result.reason === "illegal_transition") {
            await writeOperationalAlert({
              type: "final_requires_action_auto_release_illegal_transition",
              source: "run-final-charges",
              bookingId: doc.id,
              currentStatus: result.currentStatus ?? null,
            }).catch(() => {});
            continue;
          }
          if (!result.ok && result.reason === "unexpected_from") {
            continue;
          }
          await writeOperationalAlert({
            type: "final_requires_action_auto_released",
            source: "run-final-charges",
            bookingId: doc.id,
            autoReleaseHours: FINAL_REQUIRES_ACTION_RELEASE_HOURS,
            slotId: b.slotId ?? null,
            boatId: b.boatId ?? null,
            experienceId: b.experienceId ?? null,
          }).catch(() => {});
        } catch (raErr) {
          await writeOperationalAlert({
            type: "final_requires_action_auto_release_error",
            source: "run-final-charges",
            bookingId: doc.id,
            error: raErr instanceof Error ? raErr.message : String(raErr),
          }).catch(() => {});
        }
      }
    } catch (finalRequiresActionAutoReleaseErr) {
      await writeOperationalAlert({
        type: "final_requires_action_auto_release_scan_error",
        source: "run-final-charges",
        error:
          finalRequiresActionAutoReleaseErr instanceof Error
            ? finalRequiresActionAutoReleaseErr.message
            : String(finalRequiresActionAutoReleaseErr),
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, matched, processed, attempted, successCount, skipped, failed, errors });
  } catch (err) {
    bookingError("run-final-charges", "run-final-charges top-level failure", err);
    return NextResponse.json({ error: "Final charge run failed" }, { status: 500 });
  }
}
