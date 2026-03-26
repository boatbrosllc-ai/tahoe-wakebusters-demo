import type { Firestore } from "firebase-admin/firestore";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";

/**
 * Alerts when Stripe webhook events remain in `processing` longer than expected (aborted mid-handler).
 */
export async function alertOnStripeEventsProcessingStale(
  db: Firestore,
  olderThanMinutes: number
): Promise<number> {
  const cutoffMs = Date.now() - olderThanMinutes * 60 * 1000;
  const snap = await db.collection("stripeEvents").where("status", "==", "processing").limit(100).get();
  let stale = 0;
  for (const doc of snap.docs) {
    const d = doc.data() as { receivedAt?: { toDate?: () => Date } };
    const r = d.receivedAt?.toDate?.();
    if (!r || r.getTime() >= cutoffMs) continue;
    stale++;
  }
  if (stale === 0) return 0;
  await writeOperationalAlert({
    type: "stripe_events_processing_stale",
    staleCount: stale,
    olderThanMinutes,
    source: "process-confirmation-outbox",
  });
  return stale;
}
