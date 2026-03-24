/**
 * Backfill waiver requests for paid bookings that have no booking.waiver pointer (e.g. serverless crash after payment).
 */

import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getDb } from "@/lib/booking/firebase-admin";
import { listRequestsByBookingId } from "@/lib/waiver/firestore";
import { createWaiverForBooking } from "@/lib/waiver/on-booking-created";

const PAID_STATUSES = ["paid", "final_due", "final_paid"] as const;
const PAGE = 30;

export async function reconcileMissingWaivers(logPrefix: string): Promise<{ scanned: number; created: number }> {
  const db = getDb();
  const todayStr = new Date().toISOString().slice(0, 10);
  let scanned = 0;
  let created = 0;

  for (const status of PAID_STATUSES) {
    let cursor: QueryDocumentSnapshot | null = null;
    for (;;) {
      let q = db
        .collection("bookings")
        .where("status", "==", status)
        .where("startDateStr", ">=", todayStr)
        .orderBy("startDateStr", "asc")
        .limit(PAGE);
      if (cursor) q = q.startAfter(cursor);
      const snap = await q.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        scanned++;
        const b = doc.data() as {
          waiver?: { requestId?: string };
          customer?: { email?: string; name?: string };
        };
        if (b.waiver?.requestId) continue;
        const email = b.customer?.email?.trim();
        if (!email) continue;

        const existing = await listRequestsByBookingId(doc.id);
        if (existing.length > 0) continue;

        const result = await createWaiverForBooking({
          bookingId: doc.id,
          customerEmail: email,
          customerName: b.customer?.name,
        });
        if (result) {
          created++;
          console.log(`[${logPrefix}] reconcile: created waiver for booking`, doc.id);
        }
      }

      if (snap.size < PAGE) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
  }

  return { scanned, created };
}
