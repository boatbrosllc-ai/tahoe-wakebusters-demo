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
import { signManageToken } from "@/lib/booking/manageToken";
import { bookingEnv } from "@/lib/booking/env";
import { getFinalChargeIdempotencyKey, isFinalChargeLockRecent } from "@/lib/booking/final-charge-idempotency";
import { existingFinalPiAction } from "@/lib/booking/run-final-charges-action";
import type { Booking } from "@/lib/booking/types";

const PAGE_SIZE = 100;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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
            await db.collection("bookings").doc(bookingId).update({
              status: "final_paid",
              "stripe.finalChargedAt": Timestamp.now(),
              updatedAt: Timestamp.now(),
            });
            console.log("[run-final-charges] reconciled final_processing → final_paid", { bookingId, piId: existingFinalPiId });
            continue;
          }
          // Terminal incomplete or failed: allow retries by resetting status and clearing stale intent.
          if (
            piStatus === "canceled" ||
            piStatus === "requires_payment_method" ||
            piStatus === "requires_confirmation"
          ) {
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
        const customerId = booking.stripe?.customerId;
        const paymentMethodId = booking.stripe?.paymentMethodId;
        const finalCents = booking.stripe?.finalAmountCents;
        const existingFinalPiId = booking.stripe?.finalPaymentIntentId;
        if (existingFinalPiId) {
          try {
            const existingPi = await stripe.paymentIntents.retrieve(existingFinalPiId);
            const action = existingFinalPiAction(existingPi.status);
            if (action === "reconcile") {
              await db.collection("bookings").doc(bookingId).update({
                status: "final_paid",
                "stripe.finalChargedAt": Timestamp.now(),
                updatedAt: Timestamp.now(),
              });
              skipped++;
              continue;
            }
            if (action === "skip") {
              skipped++;
              continue;
            }
          } catch {
            // retrieve failed, proceed to create
          }
        }
        if (!customerId || !paymentMethodId || finalCents == null || finalCents <= 0) {
          console.warn("[run-final-charges] booking missing customerId/pm/finalAmountCents", { bookingId });
          errors.push(`${bookingId}: missing stripe data`);
          failed++;
          continue;
        }

        try {
          await db.collection("bookings").doc(bookingId).update({
            "stripe.finalChargeLockAt": nowTs,
            "stripe.finalChargeAttemptedAt": nowTs,
          });
        } catch (updateErr) {
          console.warn("[run-final-charges] lock update failed", { bookingId }, updateErr);
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
            { idempotencyKey: getFinalChargeIdempotencyKey(bookingId) }
          );
          const bookingRef = db.collection("bookings").doc(bookingId);
          const isSucceeded = pi.status === "succeeded";
          await bookingRef.update({
            "stripe.finalPaymentIntentId": pi.id,
            ...(isSucceeded ? { "stripe.finalChargedAt": Timestamp.now() } : {}),
            status: isSucceeded ? "final_paid" : "final_processing",
            updatedAt: Timestamp.now(),
          });
          if (isSucceeded) {
            console.log("[run-final-charges] PaymentIntent succeeded immediately (final_paid persisted)", { bookingId, piId: pi.id });
          } else {
            console.log("[run-final-charges] PaymentIntent created (webhook will set final_paid)", { bookingId, piId: pi.id });
          }
          attempted++;
          successCount++;
        } catch (stripeErr: unknown) {
          const err = stripeErr as { code?: string; type?: string; message?: string };
          const code = err.code ?? err.type;
          const requiresAction =
            code === "authentication_required" ||
            code === "card_authentication_required" ||
            (typeof err.message === "string" && err.message.toLowerCase().includes("authenticate"));
          const newStatus = requiresAction ? "final_requires_action" : "final_failed";
          await db.collection("bookings").doc(bookingId).update({
            status: newStatus,
            "stripe.finalError": { code, message: err.message ?? undefined },
          });
          console.log("[run-final-charges] final charge failed, status updated", { bookingId, newStatus, code });
          attempted++;
          failed++;
          errors.push(`${bookingId}: ${code ?? err.message}`);
          try {
            let manageLink: string | undefined;
            if (bookingEnv.manageBookingSecret) {
              manageLink = `${bookingEnv.appBaseUrl}/booking/manage?token=${encodeURIComponent(signManageToken({ bookingId, customerEmail: booking.customer.email, tripDateStr: booking.startDateStr }))}`;
            }
            await sendFinalChargeFailedEmail(booking.customer.email, booking.customer.name, manageLink, requiresAction);
          } catch (emailErr) {
            console.error("[run-final-charges] sendFinalChargeFailedEmail failed", bookingId, emailErr);
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
    console.error("[run-final-charges]", err);
    return NextResponse.json({ error: "Final charge run failed" }, { status: 500 });
  }
}
