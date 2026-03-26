/**
 * Tracks PaymentIntents that returned reconciliationPending from complete-after-payment
 * so a cron can alert and retry conversion when no booking exists after a grace period.
 */

import type { Firestore } from "firebase-admin/firestore";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { resolveAndConvertPayment } from "@/lib/booking/resolve-and-convert-payment";

export const RECONCILING_PAYMENTS_COLLECTION = "reconcilingPayments";

/** Grace period before cron treats PI as stuck (ms). */
export const RECONCILING_PAYMENT_STALE_MS = 10 * 60 * 1000;

export async function recordReconcilingPayment(
  db: Firestore,
  input: { holdId: string | null; paymentIntentId: string; reason: string }
): Promise<void> {
  const { FieldValue } = getFirestoreExports();
  const id = input.paymentIntentId;
  const ref = db.collection(RECONCILING_PAYMENTS_COLLECTION).doc(id);
  await ref.set(
    {
      paymentIntentId: input.paymentIntentId,
      holdId: input.holdId,
      reason: input.reason,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Scan stale reconciling payment docs; verify PI succeeded in Stripe; if no booking, alert and attempt conversion.
 */
export async function processStaleReconcilingPayments(db: Firestore): Promise<{
  scanned: number;
  resolved: number;
  alerted: number;
}> {
  const cutoffMs = Date.now() - RECONCILING_PAYMENT_STALE_MS;
  const snap = await db.collection(RECONCILING_PAYMENTS_COLLECTION).limit(50).get();

  let resolved = 0;
  let alerted = 0;
  if (snap.empty || !process.env.STRIPE_SECRET_KEY) {
    return { scanned: snap.size, resolved: 0, alerted: 0 };
  }

  const stripe = getStripe();

  for (const doc of snap.docs) {
    const d = doc.data() as { paymentIntentId?: string; holdId?: string | null; createdAt?: { toDate?: () => Date } };
    const created = d.createdAt?.toDate?.();
    if (created && created.getTime() > cutoffMs) continue;

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

  return { scanned: snap.size, resolved, alerted };
}
