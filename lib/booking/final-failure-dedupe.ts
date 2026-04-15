/**
 * Dedupe final-charge failure notifications: only one sender (cron or webhook) sends per failure.
 * A short Firestore lease prevents duplicate in-flight sends; success fields are written only after
 * the email send succeeds so a failed send can retry on the next webhook/cron delivery.
 */

import type { Firestore } from "firebase-admin/firestore";
import { getFirestoreExports } from "./firebase-admin";

const LEASE_MS = 10 * 60 * 1000;

function dedupeKey(bookingId: string, paymentIntentId?: string): string {
  return paymentIntentId ? paymentIntentId : bookingId;
}

/**
 * Begin a failure-notification send attempt. Returns true if the caller should send email.
 * Uses a lease so concurrent cron + webhook do not double-send; lease is cleared after send or on failure.
 */
export async function tryBeginFinalFailureNotificationSend(
  db: Firestore,
  bookingId: string,
  paymentIntentId?: string
): Promise<boolean> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const ref = db.collection("bookings").doc(bookingId);
  const key = dedupeKey(bookingId, paymentIntentId);
  const nowMs = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const data = snap.data() as {
      stripe?: {
        finalFailureNotifiedAt?: unknown;
        finalFailureNotifiedPaymentIntentId?: string;
        finalFailureNotifyLeaseUntil?: { toDate(): Date };
      };
    };
    const s = data.stripe;
    if (s?.finalFailureNotifiedAt != null && s.finalFailureNotifiedPaymentIntentId === key) {
      return false;
    }
    const leaseUntil = s?.finalFailureNotifyLeaseUntil?.toDate?.();
    if (leaseUntil && leaseUntil.getTime() > nowMs) return false;
    tx.update(ref, {
      "stripe.finalFailureNotifyLeaseUntil": Timestamp.fromDate(new Date(nowMs + LEASE_MS)),
      "stripe.finalFailureNotifiedPaymentIntentId": key,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

/** Call after the failure email (and optional log) succeeds. */
export async function finalizeFinalFailureNotification(
  db: Firestore,
  bookingId: string,
  paymentIntentId?: string
): Promise<void> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const key = dedupeKey(bookingId, paymentIntentId);
  await db.collection("bookings").doc(bookingId).update({
    "stripe.finalFailureNotifiedAt": Timestamp.now(),
    "stripe.finalFailureNotifiedPaymentIntentId": key,
    "stripe.finalFailureNotifyLeaseUntil": FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** Call when the email send throws so the next delivery can retry. */
export async function clearFinalFailureNotificationLease(db: Firestore, bookingId: string): Promise<void> {
  const { FieldValue } = getFirestoreExports();
  await db.collection("bookings").doc(bookingId).update({
    "stripe.finalFailureNotifyLeaseUntil": FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
