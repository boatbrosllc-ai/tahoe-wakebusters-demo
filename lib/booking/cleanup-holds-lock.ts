/**
 * Distributed lock for cleanup-holds cron (Netlify scheduled + on-demand).
 * Prevents redundant parallel runs from doubling Firestore reads under load.
 */

import type { Firestore } from "firebase-admin/firestore";

const LOCK_COLLECTION = "cron";
const LOCK_DOC_ID = "cleanup-holds-lock";
/** If runningAt is older than this, another runner may take the lock. */
export const CLEANUP_HOLDS_LOCK_MAX_AGE_MS = 5 * 60 * 1000;

export function getCleanupHoldsLockRef(db: Firestore) {
  return db.collection(LOCK_COLLECTION).doc(LOCK_DOC_ID);
}

export type AcquireCleanupHoldsLockResult = { acquired: true } | { acquired: false; reason: "already_running" };

/**
 * Try to acquire the cleanup lock in a transaction: set runningAt = now if
 * the doc is missing or runningAt is older than CLEANUP_HOLDS_LOCK_MAX_AGE_MS.
 */
export async function tryAcquireCleanupHoldsRunLock(
  db: Firestore,
  FieldValue: typeof import("firebase-admin/firestore").FieldValue,
  Timestamp: typeof import("firebase-admin/firestore").Timestamp
): Promise<AcquireCleanupHoldsLockResult> {
  const ref = getCleanupHoldsLockRef(db);
  const now = Timestamp.now();
  const nowMs = now.toMillis();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const data = snap.data() as { runningAt?: { toMillis(): number } } | undefined;
      const ra = data?.runningAt;
      if (ra && typeof ra.toMillis === "function") {
        if (nowMs - ra.toMillis() < CLEANUP_HOLDS_LOCK_MAX_AGE_MS) {
          return { acquired: false, reason: "already_running" as const };
        }
      }
    }
    tx.set(
      ref,
      {
        runningAt: now,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { acquired: true as const };
  });
}

export async function releaseCleanupHoldsRunLock(db: Firestore): Promise<void> {
  const ref = getCleanupHoldsLockRef(db);
  await ref.delete().catch(() => {});
}
