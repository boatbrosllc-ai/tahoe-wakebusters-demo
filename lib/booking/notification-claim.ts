/**
 * Idempotent claim-and-send for reminder and final-payment notifications.
 * One active claim per (bookingId, templateKey) at a time; state: claimed | sent | failed.
 */

import type { Firestore } from "firebase-admin/firestore";
import { getFirestoreExports } from "./firebase-admin";
import type { NotificationSendClaim, NotificationClaimStatus } from "./types";

const COLLECTION = "notificationSendClaims";
const CLAIM_LEASE_MS = 5 * 60 * 1000; // 5 min — stale claim can be reclaimed

function docId(bookingId: string, templateKey: string): string {
  return `${bookingId}_${templateKey}`;
}

/**
 * Try to claim the send for (bookingId, templateKey). Returns true if we claimed it,
 * false if already sent or another worker holds a recent claim.
 */
export async function tryClaimSend(
  db: Firestore,
  bookingId: string,
  templateKey: string
): Promise<boolean> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const ref = db.collection(COLLECTION).doc(docId(bookingId, templateKey));
  const now = Timestamp.now();
  const nowMs = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const d = snap.data() as NotificationSendClaim;
      if (d.status === "sent") return false;
      if (d.status === "skipped") return false;
      if (d.status === "claimed") {
        const claimedAt = d.claimedAt as { toDate?: () => Date };
        const atMs = claimedAt?.toDate ? claimedAt.toDate().getTime() : 0;
        if (nowMs - atMs < CLAIM_LEASE_MS) return false;
      }
    }
    tx.set(ref, {
      bookingId,
      templateKey,
      status: "claimed" as NotificationClaimStatus,
      claimedAt: now,
      attemptCount: (snap.exists ? ((snap.data() as NotificationSendClaim).attemptCount ?? 0) : 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

export async function markClaimSent(
  db: Firestore,
  bookingId: string,
  templateKey: string,
  opts?: { providerMessageId?: string }
): Promise<void> {
  const { FieldValue } = getFirestoreExports();
  const ref = db.collection(COLLECTION).doc(docId(bookingId, templateKey));
  await ref.update({
    status: "sent",
    sentAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...(opts?.providerMessageId ? { providerMessageId: opts.providerMessageId } : {}),
  });
}

export async function markClaimSkipped(
  db: Firestore,
  bookingId: string,
  templateKey: string,
  reason: string
): Promise<void> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const ref = db.collection(COLLECTION).doc(docId(bookingId, templateKey));
  await ref.update({
    status: "skipped",
    skipReason: reason,
    skippedAt: Timestamp.now(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function markClaimFailed(
  db: Firestore,
  bookingId: string,
  templateKey: string,
  error: string
): Promise<void> {
  const { Timestamp, FieldValue } = getFirestoreExports();
  const ref = db.collection(COLLECTION).doc(docId(bookingId, templateKey));
  await ref.update({
    status: "failed",
    failedAt: Timestamp.now(),
    lastError: error,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

/** Claims past lease window (same lease semantics as tryClaimSend). */
export async function getStaleClaimCountsByTemplateKey(db: Firestore): Promise<Record<string, number>> {
  const { Timestamp } = getFirestoreExports();
  const staleBefore = Timestamp.fromMillis(Date.now() - CLAIM_LEASE_MS);
  const snap = await db
    .collection(COLLECTION)
    .where("status", "==", "claimed")
    .where("claimedAt", "<", staleBefore)
    .get();
  const by: Record<string, number> = {};
  for (const d of snap.docs) {
    const tk = (d.data() as NotificationSendClaim).templateKey ?? "unknown";
    by[tk] = (by[tk] ?? 0) + 1;
  }
  return by;
}
