/**
 * Idempotent batch processor for pendingRefunds: validates Stripe state, creates refunds
 * with idempotency key = Firestore document id, updates status atomically.
 */

import { FieldPath } from "firebase-admin/firestore";
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { sendPendingRefundPermanentFailureAlert } from "@/lib/booking/brevo";
import {
  isPendingRefundDueForProcessing,
  PENDING_REFUND_PROCESSOR_PAGE_SIZE,
  PENDING_REFUND_PROCESSOR_RUN_BUDGET,
} from "@/lib/booking/pending-refund-ordering";
import {
  classifyStripeRefundStatus,
  PENDING_STRIPE_REFUND_POLL_MS,
} from "@/lib/booking/stripe-refund-status";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";

/** After this grace from first seen, PI-mismatch `requiresReview` rows are processed automatically (with alert). */
const REQUIRES_REVIEW_PI_MISMATCH_GRACE_MS = (() => {
  const hours = parseInt(process.env.PENDING_REFUND_REQUIRES_REVIEW_GRACE_HOURS ?? "48", 10);
  return Number.isFinite(hours) && hours >= 1 ? Math.min(hours, 24 * 14) * 60 * 60 * 1000 : 48 * 60 * 60 * 1000;
})();

const REQUIRES_REVIEW_PI_MISMATCH_REASONS = new Set([
  "pi_mismatch_propagation_exhausted",
  "pi_mismatch_in_complete_after_payment",
]);

const PAGE_SIZE = PENDING_REFUND_PROCESSOR_PAGE_SIZE;
const PER_RUN_BUDGET = PENDING_REFUND_PROCESSOR_RUN_BUDGET;

export {
  isPendingRefundDueForProcessing,
  PENDING_REFUND_PROCESSOR_PAGE_SIZE,
  PENDING_REFUND_PROCESSOR_RUN_BUDGET,
} from "@/lib/booking/pending-refund-ordering";
export const MAX_ATTEMPTS = 8;

export { classifyStripeRefundStatus, PENDING_STRIPE_REFUND_POLL_MS } from "@/lib/booking/stripe-refund-status";

/**
 * Legacy rows: `orderBy("nextRetryAt")` omits documents missing the field. Sets `nextRetryAt`
 * to now for `status === "pending"` docs that lack it (idempotent).
 */
export async function backfillPendingRefundsMissingNextRetryAt(
  db: Firestore,
  opts?: { maxDocsPerRun?: number }
): Promise<number> {
  const { Timestamp } = getFirestoreExports();
  const maxDocs = opts?.maxDocsPerRun ?? 500;
  let fixed = 0;
  let lastDoc: QueryDocumentSnapshot | null = null;
  const page = 100;

  for (;;) {
    let q = db
      .collection("pendingRefunds")
      .where("status", "==", "pending")
      .orderBy(FieldPath.documentId())
      .limit(page);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const d = doc.data() as { nextRetryAt?: unknown };
      if (d.nextRetryAt != null) continue;
      await doc.ref.update({ nextRetryAt: Timestamp.now() });
      fixed++;
      if (fixed >= maxDocs) return fixed;
    }

    lastDoc = snap.docs[snap.docs.length - 1]!;
    if (snap.size < page) break;
  }
  return fixed;
}

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

/** Full refund already applied in Stripe (PI or refund list). */
async function verifyFullRefundAlreadyApplied(stripe: Stripe, piId: string): Promise<boolean> {
  const piRaw = await stripe.paymentIntents.retrieve(piId, { expand: ["charges"] });
  const pi = piRaw as unknown as {
    amount_received?: number;
    amount?: number;
    amount_refunded?: number;
  };
  const received = pi.amount_received ?? pi.amount ?? 0;
  const refunded = typeof pi.amount_refunded === "number" ? pi.amount_refunded : 0;
  if (received > 0 && refunded >= received) return true;
  const list = await stripe.refunds.list({ payment_intent: piId, limit: 10 });
  let total = 0;
  for (const r of list.data) {
    total += typeof r.amount === "number" ? r.amount : 0;
  }
  return received > 0 && total >= received;
}

/** If a booking already took the slot for this PI, do not auto-refund. */
async function bookingExistsTakingSlotForPaymentIntent(db: Firestore, piId: string): Promise<boolean> {
  const snaps = await Promise.all([
    db.collection("bookings").where("stripe.paymentIntentId", "==", piId).limit(1).get(),
    db.collection("bookings").where("stripe.depositPaymentIntentId", "==", piId).limit(1).get(),
    db.collection("bookings").where("stripe.finalPaymentIntentId", "==", piId).limit(1).get(),
  ]);
  for (const snap of snaps) {
    if (snap.empty) continue;
    const st = (snap.docs[0].data() as { status?: string }).status;
    if (st && BOOKING_STATUSES_SLOT_TAKEN.has(st as never)) return true;
  }
  return false;
}

export async function processPendingRefundsBatch(
  db: Firestore,
  stripe: Stripe
): Promise<{ scanned: number; refunded: number; skipped: number; errors: number }> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const now = new Date();
  const staleAgeMs = parseInt(process.env.PENDING_REFUND_STALE_ALERT_MINUTES ?? "60", 10) * 60_000;
  const staleCutoff = Number.isFinite(staleAgeMs) && staleAgeMs > 0 ? staleAgeMs : 60 * 60_000;

  await backfillPendingRefundsMissingNextRetryAt(db);

  let refunded = 0;
  let skipped = 0;
  let errors = 0;
  let scanned = 0;
  let processedThisRun = 0;
  let lastDoc: QueryDocumentSnapshot | null = null;
  let stalePendingCount = 0;

  const processOne = async (doc: QueryDocumentSnapshot) => {
    const data = doc.data() as {
      status?: string;
      paymentIntentId?: string;
      duplicatePaymentIntentId?: string;
      processorAttempts?: number;
      reason?: string;
      nextRetryAt?: { toDate?: () => Date };
      requiresReview?: boolean;
      refundAmountCents?: number;
      stripeRefundId?: string;
      firstSeenAt?: { toDate?: () => Date };
      createdAt?: { toDate?: () => Date };
    };
    const created =
      data.firstSeenAt?.toDate?.() ??
      data.createdAt?.toDate?.() ??
      null;
    if (created && now.getTime() - created.getTime() > staleCutoff && data.status === "pending") {
      stalePendingCount++;
    }
    if (data.requiresReview === true && data.reason !== "amount_integrity_mismatch") {
      const reason = typeof data.reason === "string" ? data.reason : "";
      const inPiMismatchSet = REQUIRES_REVIEW_PI_MISMATCH_REASONS.has(reason);
      const firstSeen =
        data.firstSeenAt?.toDate?.() ?? data.createdAt?.toDate?.() ?? null;
      const pastGrace =
        inPiMismatchSet &&
        firstSeen != null &&
        now.getTime() - firstSeen.getTime() >= REQUIRES_REVIEW_PI_MISMATCH_GRACE_MS;
      if (!pastGrace) {
        skipped++;
        return;
      }
      try {
        await writeOperationalAlert({
          type: "pending_refund_requires_review_auto_processing_after_grace",
          source: "process-pending-refunds",
          pendingRefundId: doc.id,
          paymentIntentId: (data.paymentIntentId || data.duplicatePaymentIntentId)?.trim(),
          reason,
          graceHours: REQUIRES_REVIEW_PI_MISMATCH_GRACE_MS / (60 * 60 * 1000),
        });
        await doc.ref.update({ requiresReview: FieldValue.delete() });
      } catch {
        /* non-fatal */
      }
    }
    const piId = (data.paymentIntentId || data.duplicatePaymentIntentId)?.trim();
    if (!piId) {
      skipped++;
      return;
    }

    let isPartialRefundAttempt = false;
    try {
      if (await bookingExistsTakingSlotForPaymentIntent(db, piId)) {
        await doc.ref.update({
          status: "resolved",
          resolvedAt: Timestamp.now(),
          notes: "Booking confirmed; no refund needed",
          nextRetryAt: FieldValue.delete(),
        });
        refunded++;
        return;
      }

      const piRaw = await stripe.paymentIntents.retrieve(piId);
      const pi = piRaw as unknown as {
        status?: string;
        amount_received?: number;
        amount?: number;
        amount_refunded?: number;
      };
      if (pi.status !== "succeeded") {
        skipped++;
        return;
      }
      const received = pi.amount_received ?? pi.amount ?? 0;
      const already = typeof pi.amount_refunded === "number" ? pi.amount_refunded : 0;
      if (received <= 0) {
        skipped++;
        return;
      }
      if (already >= received) {
        await doc.ref.update({
          status: "resolved",
          resolvedAt: Timestamp.now(),
          notes: "Already fully refunded (verified in Stripe)",
          nextRetryAt: FieldValue.delete(),
        });
        refunded++;
        return;
      }

      const applyRefundOutcome = async (refund: Stripe.Refund) => {
        const outcome = classifyStripeRefundStatus(refund.status ?? undefined);
        if (outcome === "terminal_success") {
          await doc.ref.update({
            status: "resolved",
            resolvedAt: Timestamp.now(),
            stripeRefundId: refund.id,
            lastProcessorError: FieldValue.delete(),
            nextRetryAt: FieldValue.delete(),
            processorAttempts: FieldValue.delete(),
          });
          refunded++;
          return;
        }
        if (outcome === "terminal_failure") {
          const msg = `${refund.failure_reason ?? refund.status ?? "failed"}`.slice(0, 1000);
          await doc.ref.update({
            status: "failed",
            stripeRefundId: refund.id,
            lastProcessorError: msg,
            nextRetryAt: FieldValue.delete(),
            processorAttempts: FieldValue.delete(),
          });
          await writeOperationalAlert({
            type: "pending_refund_processor_permanent_failure",
            source: "process-pending-refunds",
            pendingRefundId: doc.id,
            paymentIntentId: piId,
            reason: data.reason,
            error: msg.slice(0, 500),
          });
          await sendPendingRefundPermanentFailureAlert({
            pendingRefundId: doc.id,
            paymentIntentId: piId,
            reason: data.reason,
            error: msg.slice(0, 500),
          });
          errors++;
          return;
        }
        await doc.ref.update({
          status: "pending",
          stripeRefundId: refund.id,
          lastProcessorError: FieldValue.delete(),
          nextRetryAt: Timestamp.fromDate(new Date(now.getTime() + PENDING_STRIPE_REFUND_POLL_MS)),
        });
        skipped++;
      };

      const existingRefundId = data.stripeRefundId?.trim();
      if (existingRefundId) {
        const refund = await stripe.refunds.retrieve(existingRefundId);
        await applyRefundOutcome(refund);
        return;
      }

      const rawRefundAmt = data.refundAmountCents;
      const partial =
        typeof rawRefundAmt === "number" &&
        Number.isFinite(rawRefundAmt) &&
        rawRefundAmt > 0 &&
        rawRefundAmt < received;
      isPartialRefundAttempt = partial;
      const refundParams: { payment_intent: string; amount?: number } = { payment_intent: piId };
      if (partial) {
        refundParams.amount = Math.round(rawRefundAmt);
      }

      const refund = await stripe.refunds.create(refundParams, { idempotencyKey: doc.id });
      await applyRefundOutcome(refund);
    } catch (err) {
      const code = (err as { code?: string }).code;
      const msg = err instanceof Error ? err.message : String(err);
      if (code === "amount_too_large") {
        if (isPartialRefundAttempt) {
          try {
            await doc.ref.update({
              status: "failed",
              lastProcessorError: msg.slice(0, 1000),
              nextRetryAt: FieldValue.delete(),
              processorAttempts: FieldValue.delete(),
            });
            await writeOperationalAlert({
              type: "pending_refund_amount_too_large_shortfall",
              source: "process-pending-refunds",
              pendingRefundId: doc.id,
              paymentIntentId: piId,
              reason: data.reason,
              refundAmountCents: data.refundAmountCents,
              error: msg.slice(0, 500),
            });
            await sendPendingRefundPermanentFailureAlert({
              pendingRefundId: doc.id,
              paymentIntentId: piId,
              reason: data.reason,
              error: msg.slice(0, 500),
            });
            errors++;
          } catch {
            errors++;
          }
          return;
        }
        try {
          const verified = await verifyFullRefundAlreadyApplied(stripe, piId);
          if (verified) {
            await doc.ref.update({
              status: "resolved",
              resolvedAt: Timestamp.now(),
              notes: "amount_too_large — verified full refund in Stripe",
              nextRetryAt: FieldValue.delete(),
              lastProcessorError: FieldValue.delete(),
            });
            refunded++;
          } else {
            await doc.ref.update({
              status: "failed",
              lastProcessorError: msg.slice(0, 1000),
              nextRetryAt: FieldValue.delete(),
              processorAttempts: FieldValue.delete(),
            });
            await writeOperationalAlert({
              type: "pending_refund_amount_too_large_unverified",
              source: "process-pending-refunds",
              pendingRefundId: doc.id,
              paymentIntentId: piId,
              reason: data.reason,
              error: msg.slice(0, 500),
            });
            await sendPendingRefundPermanentFailureAlert({
              pendingRefundId: doc.id,
              paymentIntentId: piId,
              reason: data.reason,
              error: msg.slice(0, 500),
            });
            errors++;
          }
        } catch (verifyErr) {
          if (verifyErr instanceof Error) {
            await doc.ref.update({
              status: "failed",
              lastProcessorError: verifyErr.message.slice(0, 1000),
              nextRetryAt: FieldValue.delete(),
              processorAttempts: FieldValue.delete(),
            });
            await writeOperationalAlert({
              type: "pending_refund_amount_too_large_unverified",
              source: "process-pending-refunds",
              pendingRefundId: doc.id,
              paymentIntentId: piId,
              reason: data.reason,
              error: `verify_failed: ${verifyErr.message.slice(0, 400)}`,
            });
            await sendPendingRefundPermanentFailureAlert({
              pendingRefundId: doc.id,
              paymentIntentId: piId,
              reason: data.reason,
              error: `verify_failed: ${verifyErr.message.slice(0, 400)}`,
            });
          }
          errors++;
        }
        return;
      }
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
        return;
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
        return;
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
        await sendPendingRefundPermanentFailureAlert({
          pendingRefundId: doc.id,
          paymentIntentId: piId,
          reason: data.reason,
          error: msg.slice(0, 500),
        });
      }
      errors++;
    }
  };

  while (processedThisRun < PER_RUN_BUDGET) {

    let q = db
      .collection("pendingRefunds")
      .where("status", "==", "pending")
      .orderBy("nextRetryAt", "asc")
      .limit(PAGE_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    let stoppedAtFuture = false;
    for (const doc of snap.docs) {
      scanned++;
      const data = doc.data() as { nextRetryAt?: { toDate?: () => Date } };
      if (!isPendingRefundDueForProcessing(data, now)) {
        stoppedAtFuture = true;
        break;
      }
      await processOne(doc);
      processedThisRun++;
      if (processedThisRun >= PER_RUN_BUDGET) break;
    }

    if (stoppedAtFuture) break;

    lastDoc = snap.docs[snap.docs.length - 1]!;
    if (snap.size < PAGE_SIZE) break;
  }

  if (stalePendingCount > 0) {
    try {
      await writeOperationalAlert({
        type: "pending_refunds_stale_pending",
        source: "process-pending-refunds",
        severity: "critical",
        stalePendingCount,
        staleMinutes: Math.round(staleCutoff / 60_000),
      });
    } catch {
      // Alert pipeline failures should not block the batch.
    }
  }

  return { scanned, refunded, skipped, errors };
}
