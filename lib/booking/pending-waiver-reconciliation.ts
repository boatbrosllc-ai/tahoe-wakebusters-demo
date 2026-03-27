/**
 * Retries waiver creation for docs in `pendingWaiverCreation` (e.g. after reschedule voided a waiver).
 */

import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import { createWaiverForBooking, sendWaiverInviteAndMarkSent } from "@/lib/waiver/on-booking-created";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";

const BATCH_LIMIT = 15;
const STALE_HOURS = (() => {
  const n = parseInt(process.env.PENDING_WAIVER_CREATION_STALE_ALERT_HOURS ?? "24", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 168) : 24;
})();

export async function processPendingWaiverCreationQueue(db: Firestore): Promise<{
  attempted: number;
  succeeded: number;
  failed: number;
}> {
  const snap = await db.collection("pendingWaiverCreation").limit(BATCH_LIMIT).get();
  let succeeded = 0;
  let failed = 0;
  for (const doc of snap.docs) {
    const bookingId = doc.id;
    const row = doc.data() as { customerEmail?: string; customerName?: string };
    const email = row.customerEmail?.trim() ?? "";
    if (!email) {
      failed++;
      continue;
    }
    try {
      const waiverResult = await createWaiverForBooking({
        bookingId,
        customerEmail: email,
        customerName: row.customerName ?? "",
      });
      if (waiverResult?.sendSeparateWaiverInvite) {
        await sendWaiverInviteAndMarkSent(waiverResult);
      }
      await doc.ref.delete();
      succeeded++;
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      const { Timestamp } = getFirestoreExports();
      await doc.ref.set(
        {
          lastRetryError: msg.slice(0, 1000),
          lastRetryAt: Timestamp.now(),
        },
        { merge: true }
      );
    }
  }
  return { attempted: snap.size, succeeded, failed };
}

export async function alertOnStalePendingWaiverCreation(db: Firestore): Promise<void> {
  const snap = await db.collection("pendingWaiverCreation").limit(50).get();
  if (snap.empty) return;
  const cutoffMs = Date.now() - STALE_HOURS * 60 * 60 * 1000;
  const staleDocs = snap.docs.filter((d) => {
    const c = (d.data() as { createdAt?: { toDate?: () => Date } }).createdAt?.toDate?.()?.getTime() ?? 0;
    return c > 0 && c < cutoffMs;
  });
  if (staleDocs.length === 0) return;
  const bookingIds = staleDocs.map((d: QueryDocumentSnapshot) => d.id);
  await writeOperationalAlert({
    type: "pending_waiver_creation_stale",
    source: "process-confirmation-outbox",
    count: staleDocs.length,
    bookingIds: bookingIds.slice(0, 30),
    staleHours: STALE_HOURS,
  });
}
