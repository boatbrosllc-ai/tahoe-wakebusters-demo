/**
 * Tracks PaymentIntents that returned reconciliationPending from complete-after-payment
 * so a cron can alert and retry conversion when no booking exists after a grace period.
 *
 * Staleness in `processStaleReconcilingPayments` is based on **createdAt**: the first time we
 * recorded this payment intent in the reconciling queue (first-seen). Heartbeats and reason
 * updates bump **updatedAt** only via `recordReconcilingPayment`, so repeated client retries do
 * not reset the grace window. We intentionally do **not** use `updatedAt` for stale cutoff, so
 * activity from polling does not indefinitely postpone automatic recovery.
 */

import type { Firestore, Timestamp } from "firebase-admin/firestore";
import { FieldPath } from "firebase-admin/firestore";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { resolveAndConvertPayment } from "@/lib/booking/resolve-and-convert-payment";

export const RECONCILING_PAYMENTS_COLLECTION = "reconcilingPayments";

/** Grace period before cron treats PI as stuck (ms). Measured from `createdAt` (first-seen). */
export const RECONCILING_PAYMENT_STALE_MS = 10 * 60 * 1000;

/** Documents read per Firestore page when scanning the reconciling queue. */
export const RECONCILING_PAYMENTS_PAGE_SIZE = 50;

/** Max stale reconciling docs to fully process (Stripe + conversion attempt) per cron run. */
export const RECONCILING_PAYMENTS_STALE_PROCESSING_BUDGET_PER_RUN = 50;

export async function recordReconcilingPayment(
  db: Firestore,
  input: { holdId: string | null; paymentIntentId: string; reason: string }
): Promise<void> {
  const { FieldValue } = getFirestoreExports();
  const id = input.paymentIntentId;
  const ref = db.collection(RECONCILING_PAYMENTS_COLLECTION).doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const base = {
      paymentIntentId: input.paymentIntentId,
      holdId: input.holdId,
      reason: input.reason,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!snap.exists) {
      tx.set(ref, {
        ...base,
        createdAt: FieldValue.serverTimestamp(),
      });
    } else {
      tx.set(ref, base, { merge: true });
    }
  });
}

export type ReconcilingPaymentsProcessMetrics = {
  /** Documents read from Firestore this run (across all pages touched). */
  totalScanned: number;
  /** Among scanned docs, count past the stale cutoff (`createdAt` first-seen). */
  staleEligible: number;
  /** Stale docs for which we ran Stripe/conversion work (capped by per-run budget). */
  staleProcessed: number;
  /** Reconciling docs deleted after successful conversion / idempotent hit. */
  resolved: number;
  /** Operational alerts emitted (errors, no booking, no hold id, conversion failure). */
  alerted: number;
  /** @deprecated Prefer `totalScanned`; kept for brief backward compatibility. */
  scanned: number;
};

/**
 * Scan stale reconciling payment docs; verify PI succeeded in Stripe; if no booking, alert and attempt conversion.
 * Paginates by stable sort (`createdAt`, document id) with a per-run processing budget to limit Stripe load.
 */
export async function processStaleReconcilingPayments(db: Firestore): Promise<ReconcilingPaymentsProcessMetrics> {
  const cutoffMs = Date.now() - RECONCILING_PAYMENT_STALE_MS;
  const col = db.collection(RECONCILING_PAYMENTS_COLLECTION);
  if (!process.env.STRIPE_SECRET_KEY) {
    return {
      totalScanned: 0,
      staleEligible: 0,
      staleProcessed: 0,
      resolved: 0,
      alerted: 0,
      scanned: 0,
    };
  }

  const stripe = getStripe();
  let totalScanned = 0;
  let staleEligible = 0;
  let staleProcessed = 0;
  let resolved = 0;
  let alerted = 0;
  let lastCreatedAt: Timestamp | undefined;
  let lastDocId: string | undefined;

  const budget = RECONCILING_PAYMENTS_STALE_PROCESSING_BUDGET_PER_RUN;
  let stopScan = false;

  outer: while (!stopScan) {
    let q = col
      .orderBy("createdAt", "asc")
      .orderBy(FieldPath.documentId(), "asc")
      .limit(RECONCILING_PAYMENTS_PAGE_SIZE);

    if (lastCreatedAt != null && lastDocId != null) {
      q = q.startAfter(lastCreatedAt, lastDocId);
    }

    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      totalScanned++;
      const d = doc.data() as { paymentIntentId?: string; holdId?: string | null; createdAt?: { toDate?: () => Date } };
      const created = d.createdAt?.toDate?.();
      const createdMs = created ? created.getTime() : 0;
      if (createdMs > cutoffMs) continue;

      staleEligible++;
      if (staleProcessed >= budget) {
        stopScan = true;
        break outer;
      }
      staleProcessed++;

      const piId = d.paymentIntentId ?? doc.id;
      try {
        const pi = await stripe.paymentIntents.retrieve(piId);
        if (pi.status !== "succeeded") {
          continue;
        }
        const holdId =
          typeof pi.metadata?.holdId === "string" && pi.metadata.holdId.trim()
            ? pi.metadata.holdId.trim()
            : typeof d.holdId === "string" && d.holdId.trim()
              ? d.holdId.trim()
              : null;
        if (!holdId) {
          await writeOperationalAlert({
            type: "reconciling_payment_no_hold_id",
            paymentIntentId: piId,
            source: "reconcile-reconciling-payments",
          });
          alerted++;
          continue;
        }

        try {
          const conversion = await resolveAndConvertPayment(db, {
            paymentIntentId: piId,
            holdId,
            source: "client",
            paymentIntent: pi,
          });
          if ("alreadyConverted" in conversion.result && conversion.result.alreadyConverted) {
            await doc.ref.delete().catch(() => {});
            resolved++;
            continue;
          }
          if ("bookingId" in conversion.result && conversion.result.bookingId) {
            await doc.ref.delete().catch(() => {});
            resolved++;
            continue;
          }
        } catch {
          /* conversion may throw; fall through to alert */
        }

        await writeOperationalAlert({
          type: "reconciling_payment_stale_no_booking",
          paymentIntentId: piId,
          holdId,
          source: "reconcile-reconciling-payments",
        });
        alerted++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await writeOperationalAlert({
          type: "reconciling_payment_scan_error",
          paymentIntentId: piId,
          error: msg.slice(0, 500),
          source: "reconcile-reconciling-payments",
        });
        alerted++;
      }
    }

    const last = snap.docs[snap.docs.length - 1];
    const lastData = last.data() as { createdAt?: Timestamp };
    lastCreatedAt = lastData.createdAt;
    lastDocId = last.id;
    if (snap.size < RECONCILING_PAYMENTS_PAGE_SIZE) break;
  }

  return {
    totalScanned,
    staleEligible,
    staleProcessed,
    resolved,
    alerted,
    scanned: totalScanned,
  };
}
