/**
 * Idempotent batch processor for pendingRefunds: validates Stripe state, creates refunds
 * with idempotency key = Firestore document id, updates status atomically.
 */

import type { Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";

const BATCH_LIMIT = 40;
const MAX_ATTEMPTS = 8;

function isRetriableStripeError(err: unknown): boolean {
  const e = err as { statusCode?: number; type?: string; code?: string; message?: string };
  if (e.statusCode === 429) return true;
  if (e.type === "StripeConnectionError") return true;
  if (e.type === "StripeAPIError" && typeof e.statusCode === "number" && e.statusCode >= 500) return true;
  return false;
}

function backoffMs(attempt: number): number {
  return Math.min(60_000 * Math.pow(2, Math.max(0, attempt - 1)), 4 * 60 * 60_000);
}

export async function processPendingRefundsBatch(
  db: Firestore,
  stripe: Stripe
): Promise<{ scanned: number; refunded: number; skipped: number; errors: number }> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = new Date();
  const snap = await db.collection("pendingRefunds").where("status", "==", "pending").limit(BATCH_LIMIT).get();

  let refunded = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of snap.docs) {
    const data = doc.data() as {
      status?: string;
      paymentIntentId?: string;
      duplicatePaymentIntentId?: string;
      processorAttempts?: number;
      reason?: string;
      nextRetryAt?: { toDate?: () => Date };
    };
    const piId = (data.paymentIntentId || data.duplicatePaymentIntentId)?.trim();
    if (!piId) {
      skipped++;
      continue;
    }
    const next = data.nextRetryAt?.toDate?.();
    if (next && next > now) {
      skipped++;
      continue;
    }

    try {
      const piRaw = await stripe.paymentIntents.retrieve(piId);
      const pi = piRaw as unknown as {
        status?: string;
        amount_received?: number;
        amount?: number;
        amount_refunded?: number;
      };
      if (pi.status !== "succeeded") {
        skipped++;
        continue;
      }
      const received = pi.amount_received ?? pi.amount ?? 0;
      const already = typeof pi.amount_refunded === "number" ? pi.amount_refunded : 0;
      if (received <= 0) {
        skipped++;
        continue;
      }
      if (already >= received) {
        await doc.ref.update({
          status: "resolved",
          resolvedAt: Timestamp.now(),
          notes: "Already fully refunded (verified in Stripe)",
          nextRetryAt: FieldValue.delete(),
        });
        refunded++;
        continue;
      }

      const refund = await stripe.refunds.create(
        { payment_intent: piId },
        { idempotencyKey: doc.id }
      );

      await doc.ref.update({
        status: "resolved",
        resolvedAt: Timestamp.now(),
        stripeRefundId: refund.id,
        lastProcessorError: FieldValue.delete(),
        nextRetryAt: FieldValue.delete(),
        processorAttempts: FieldValue.delete(),
      });
      refunded++;
    } catch (err) {
      const code = (err as { code?: string }).code;
      const msg = err instanceof Error ? err.message : String(err);
      if (code === "charge_already_refunded") {
        try {
          await doc.ref.update({
            status: "resolved",
            resolvedAt: Timestamp.now(),
            notes: "charge_already_refunded",
            nextRetryAt: FieldValue.delete(),
          });
          refunded++;
        } catch {
          errors++;
        }
        continue;
      }

      const attempts = (data.processorAttempts ?? 0) + 1;
      const retriable = isRetriableStripeError(err);
      const giveUp = attempts >= MAX_ATTEMPTS || !retriable;

      try {
        await doc.ref.update({
          processorAttempts: attempts,
          lastProcessorError: msg.slice(0, 1000),
          ...(giveUp
            ? {
                status: "failed",
                nextRetryAt: FieldValue.delete(),
              }
            : {
                nextRetryAt: Timestamp.fromDate(new Date(now.getTime() + backoffMs(attempts))),
              }),
        });
      } catch {
        errors++;
        continue;
      }

      if (giveUp) {
        await writeOperationalAlert({
          type: "pending_refund_processor_permanent_failure",
          source: "process-pending-refunds",
          pendingRefundId: doc.id,
          paymentIntentId: piId,
          reason: data.reason,
          error: msg.slice(0, 500),
        });
      }
      errors++;
    }
  }

  return { scanned: snap.size, refunded, skipped, errors };
}
