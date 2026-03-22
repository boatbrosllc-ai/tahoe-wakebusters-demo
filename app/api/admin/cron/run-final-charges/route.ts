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
import type { QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";
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
} from "@/lib/booking/final-charge-idempotency";
import {
  tryBeginFinalFailureNotificationSend,
  finalizeFinalFailureNotification,
  clearFinalFailureNotificationLease,
} from "@/lib/booking/final-failure-dedupe";
import type { Booking } from "@/lib/booking/types";
import { timingSafeStringEqual } from "@/lib/booking/secure-compare";
import { bookingLog } from "@/lib/booking/debug";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { applyFinalPaymentRevenueIncrement } from "@/lib/booking/summary-revenue";
import { notifyFinalChargeSuccess } from "@/lib/booking/notify-final-charge-success";

const PAGE_SIZE = 100;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") ?? "";
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || !timingSafeStringEqual(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
            await db.runTransaction(async (tx) => {
              const ref = db.collection("bookings").doc(bookingId);
              const snap = await tx.get(ref);
              if (!snap.exists) return;
              const b = snap.data() as Booking;
              const sb = b.stripe;
              const isDepositFlow = typeof sb?.depositAmountCents === "number";
              const finalRev = typeof sb?.finalAmountCents === "number" ? sb.finalAmountCents : 0;
              if (isDepositFlow && finalRev > 0 && sb?.finalRevenueSummaryApplied !== true) {
                applyFinalPaymentRevenueIncrement(tx, db, FieldValue, finalRev);
              }
              tx.update(ref, {
                status: "final_paid",
                "stripe.finalChargedAt": Timestamp.now(),
                ...(isDepositFlow && finalRev > 0 && sb?.finalRevenueSummaryApplied !== true
                  ? { "stripe.finalRevenueSummaryApplied": true }
                  : {}),
                updatedAt: Timestamp.now(),
              });
            });
            console.log("[run-final-charges] reconciled final_processing → final_paid", { bookingId, piId: existingFinalPiId });
            try {
              const fresh = await db.collection("bookings").doc(bookingId).get();
              if (fresh.exists) await notifyFinalChargeSuccess(db, bookingId, fresh.data() as Booking);
            } catch (notifyErr) {
              console.error("[run-final-charges] notifyFinalChargeSuccess failed", bookingId, notifyErr);
            }
            continue;
          }
          // Terminal incomplete or failed: allow retries by resetting status and clearing stale intent.
          if (
            piStatus === "canceled" ||
            piStatus === "requires_payment_method" ||
            piStatus === "requires_confirmation"
          ) {
            const customerLocksFresh =
              isCustomerPayLockRecent(booking.stripe?.customerPayLockAt, now) ||
              isCustomerFinalPiInFlightRecent(booking.stripe?.customerFinalPiInFlightAt, now);
            if (customerLocksFresh) {
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
            await db.collection("bookings").doc(bookingId).update({
              status: "final_due",
              "stripe.finalPaymentIntentId": FieldValue.delete(),
              updatedAt: Timestamp.now(),
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
        } catch {
          // retrieve failed; skip this booking this run
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
        const customerId = booking.stripe?.customerId;
        const paymentMethodId = booking.stripe?.paymentMethodId;
        const finalCents = booking.stripe?.finalAmountCents;
        const existingFinalPiId = booking.stripe?.finalPaymentIntentId;
        if (existingFinalPiId) {
          try {
            const existingPi = await stripe.paymentIntents.retrieve(existingFinalPiId);
            const customerLocksFresh =
              isCustomerPayLockRecent(booking.stripe?.customerPayLockAt, now) ||
              isCustomerFinalPiInFlightRecent(booking.stripe?.customerFinalPiInFlightAt, now);
            const action = existingFinalPiAction(existingPi.status, {
              context: "cron",
              hasStoredFinalPaymentIntentId: true,
              customerLocksFresh,
            });
            if (action === "reconcile") {
              const bookingRef = db.collection("bookings").doc(bookingId);
              await db.runTransaction(async (tx) => {
                const snap = await tx.get(bookingRef);
                if (!snap.exists) return;
                const b = snap.data() as Booking;
                const sb = b.stripe;
                const isDepositFlow = typeof sb?.depositAmountCents === "number";
                const finalRev = typeof sb?.finalAmountCents === "number" ? sb.finalAmountCents : 0;
                const alreadySummarized = sb?.finalRevenueSummaryApplied === true;
                if (isDepositFlow && finalRev > 0 && !alreadySummarized) {
                  applyFinalPaymentRevenueIncrement(tx, db, FieldValue, finalRev);
                }
                tx.update(bookingRef, {
                  status: "final_paid",
                  "stripe.finalChargedAt": Timestamp.now(),
                  updatedAt: Timestamp.now(),
                  ...(isDepositFlow && finalRev > 0 && !alreadySummarized
                    ? { "stripe.finalRevenueSummaryApplied": true }
                    : {}),
                });
              });
              try {
                const fresh = await db.collection("bookings").doc(bookingId).get();
                if (fresh.exists) await notifyFinalChargeSuccess(db, bookingId, fresh.data() as Booking);
              } catch (notifyErr) {
                console.error("[run-final-charges] notifyFinalChargeSuccess failed", bookingId, notifyErr);
              }
              attempted++;
              successCount++;
              continue;
            }
            if (action === "skip") {
              skipped++;
              continue;
            }
            // create: cancel stale/abandoned intent and drop Firestore reference so off-session create can proceed
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
            try {
              await stripe.paymentIntents.cancel(existingFinalPiId);
            } catch (cancelErr) {
              console.warn("[run-final-charges] cancel stale final PI failed (non-fatal)", {
                bookingId,
                existingFinalPiId,
                error: cancelErr instanceof Error ? cancelErr.message : cancelErr,
              });
            }
            await db.collection("bookings").doc(bookingId).update({
              "stripe.finalPaymentIntentId": FieldValue.delete(),
              updatedAt: Timestamp.now(),
            });
          } catch {
            // retrieve failed, proceed to create
          }
        }
        if (!customerId || !paymentMethodId || finalCents == null || finalCents <= 0) {
          console.warn("[run-final-charges] booking missing customerId/pm/finalAmountCents", { bookingId });
          const missingFields: string[] = [];
          if (!customerId) missingFields.push("stripe.customerId");
          if (!paymentMethodId) missingFields.push("stripe.paymentMethodId");
          if (finalCents == null || finalCents <= 0) missingFields.push("stripe.finalAmountCents");
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
            const lockAt = b.stripe?.finalChargeLockAt;
            if (isFinalChargeLockRecent(lockAt, now)) return { acquired: false, reason: "lock_held" };
            if (isCustomerFinalPiInFlightRecent(b.stripe?.customerFinalPiInFlightAt, now)) {
              return { acquired: false, reason: "customer_final_pi_in_flight" };
            }
            tx.update(bookingRef, {
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

        try {
          const pi = await stripe.paymentIntents.create(
            {
              amount: finalCents,
              currency: "usd",
              customer: customerId,
              payment_method: paymentMethodId,
              off_session: true,
              confirm: true,
              metadata: { bookingId, payment_stage: "final" },
            },
            { idempotencyKey: getFinalChargeIdempotencyKey(bookingId, "cron") }
          );
          const bookingRef = db.collection("bookings").doc(bookingId);
          const isSucceeded = pi.status === "succeeded";
          if (isSucceeded) {
            const piAmount = typeof pi.amount === "number" ? pi.amount : 0;
            await db.runTransaction(async (tx) => {
              const snap = await tx.get(bookingRef);
              if (!snap.exists) return;
              const b = snap.data() as Booking;
              const sb = b.stripe;
              const isDepositFlow = typeof sb?.depositAmountCents === "number";
              const finalRev =
                typeof sb?.finalAmountCents === "number" && sb.finalAmountCents > 0
                  ? sb.finalAmountCents
                  : finalCents ?? piAmount;
              if (isDepositFlow && finalRev > 0 && sb?.finalRevenueSummaryApplied !== true) {
                applyFinalPaymentRevenueIncrement(tx, db, FieldValue, finalRev);
              }
              tx.update(bookingRef, {
                "stripe.finalPaymentIntentId": pi.id,
                "stripe.finalChargedAt": Timestamp.now(),
                status: "final_paid",
                ...(isDepositFlow && finalRev > 0 && sb?.finalRevenueSummaryApplied !== true
                  ? { "stripe.finalRevenueSummaryApplied": true }
                  : {}),
                updatedAt: Timestamp.now(),
              });
            });
          } else {
            await bookingRef.update({
              "stripe.finalPaymentIntentId": pi.id,
              status: "final_processing",
              updatedAt: Timestamp.now(),
            });
          }
          if (isSucceeded) {
            console.log("[run-final-charges] PaymentIntent succeeded immediately (final_paid persisted)", { bookingId, piId: pi.id });
            try {
              const fresh = await db.collection("bookings").doc(bookingId).get();
              if (fresh.exists) await notifyFinalChargeSuccess(db, bookingId, fresh.data() as Booking);
            } catch (notifyErr) {
              console.error("[run-final-charges] notifyFinalChargeSuccess failed", bookingId, notifyErr);
            }
          } else {
            console.log("[run-final-charges] PaymentIntent created (webhook will set final_paid)", { bookingId, piId: pi.id });
          }
          attempted++;
          successCount++;
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
                  customerEmail: custEmail,
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
              }).catch((err) => console.error("[run-final-charges] logNotificationSent failed", bookingId, err));
              await finalizeFinalFailureNotification(db, bookingId, failedPiId);
            } catch (emailErr) {
              console.error("[run-final-charges] sendFinalChargeFailedEmail failed", bookingId, emailErr);
              await clearFinalFailureNotificationLease(db, bookingId).catch((clearErr) =>
                console.error("[run-final-charges] clearFinalFailureNotificationLease failed", bookingId, clearErr)
              );
            }
          }
        }
      }

      if (snap.size < PAGE_SIZE) break;
      cursor = snap.docs[snap.docs.length - 1];
    }

    // processed = mutually exclusive outcomes: success + skipped + failed (no double-count)
    const processed = successCount + skipped + failed;
    return NextResponse.json({ ok: true, matched, processed, attempted, successCount, skipped, failed, errors });
  } catch (err) {
    console.error("[admin/cron/run-final-charges]", err);
    return NextResponse.json({ error: "Final charge run failed" }, { status: 500 });
  }
}
