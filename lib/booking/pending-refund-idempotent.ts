import { createHash } from "crypto";
import type { Firestore } from "firebase-admin/firestore";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";

export type PendingRefundStableParts = {
  reason: string;
  holdId?: string | null;
  bookingId?: string | null;
  /** Primary or duplicate PI id depending on incident */
  paymentIntentId?: string | null;
  sessionId?: string | null;
  duplicatePaymentIntentId?: string | null;
  expectedPaymentIntentId?: string | null;
};

export function pendingRefundDocumentId(parts: PendingRefundStableParts): string {
  const segments = [
    parts.reason,
    parts.holdId ?? "",
    parts.bookingId ?? "",
    parts.paymentIntentId ?? "",
    parts.sessionId ?? "",
    parts.duplicatePaymentIntentId ?? "",
    parts.expectedPaymentIntentId ?? "",
  ];
  const h = createHash("sha256").update(segments.join("|")).digest("hex");
  return `pr_${h.slice(0, 48)}`;
}

/**
 * Idempotent pending-refund row: deterministic doc id, merge fields, firstSeenAt / lastSeenAt / occurrences.
 */
export async function upsertPendingRefundRecord(
  db: Firestore,
  stable: PendingRefundStableParts,
  payload: Record<string, unknown>
): Promise<{ wasNew: boolean }> {
  const { FieldValue, Timestamp } = getFirestoreExports();
  const docId = pendingRefundDocumentId(stable);
  const ref = db.collection("pendingRefunds").doc(docId);
  let wasNew = false;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Timestamp.now();
    if (!snap.exists) {
      wasNew = true;
      tx.set(ref, {
        ...payload,
        reason: stable.reason,
        createdAt: now,
        firstSeenAt: now,
        lastSeenAt: now,
        occurrences: 1,
        status: "pending",
        nextRetryAt: now,
      });
    } else {
      const prev = snap.data() as { nextRetryAt?: unknown };
      tx.set(
        ref,
        {
          ...payload,
          reason: stable.reason,
          lastSeenAt: now,
          occurrences: FieldValue.increment(1),
          ...(!prev.nextRetryAt ? { nextRetryAt: now } : {}),
        },
        { merge: true }
      );
    }
  });
  return { wasNew };
}
