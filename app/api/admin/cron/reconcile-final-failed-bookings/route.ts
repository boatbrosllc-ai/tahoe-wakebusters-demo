import { NextRequest, NextResponse } from "next/server";
import type { QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { assertCronPostAuthorized } from "@/lib/booking/cron-auth";
import { executeFinalFailedBookingReleaseTransaction } from "@/lib/booking/release-hold-transaction";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";

const PAGE_SIZE = 100;
const BATCH_SIZE = 10;
const FINAL_FAILED_RELEASE_SLA_HOURS = (() => {
  // Default SLA intentionally short to reduce stranded inventory after definitive final-payment failure.
  const n = parseInt(process.env.FINAL_FAILED_RELEASE_SLA_HOURS ?? "6", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 24 * 30) : 6;
})();

export async function POST(request: NextRequest) {
  const authErr = await assertCronPostAuthorized(request);
  if (authErr) return authErr;
  try {
    const db = getDb();
    const { Timestamp } = getFirestoreExports();
    const cutoff = new Date(Date.now() - FINAL_FAILED_RELEASE_SLA_HOURS * 60 * 60 * 1000);
    const cutoffTs = Timestamp.fromDate(cutoff);

    let matched = 0;
    let released = 0;
    let skipped = 0;
    let failed = 0;
    let cursor: QueryDocumentSnapshot<DocumentData> | null = null;

    while (true) {
      let q = db
        .collection("bookings")
        .where("status", "==", "final_failed")
        .where("finalChargeAt", "<=", cutoffTs)
        .orderBy("finalChargeAt", "asc")
        .limit(PAGE_SIZE);
      if (cursor) q = q.startAfter(cursor);
      const snap = await q.get();
      if (snap.empty) break;
      matched += snap.size;

      for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
        const batch = snap.docs.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (doc) => {
            try {
              const result = await executeFinalFailedBookingReleaseTransaction(db, doc.id);
              if (result.released) return "released" as const;
              await writeOperationalAlert({
                type: "final_failed_booking_needs_review",
                source: "reconcile-final-failed-bookings",
                bookingId: doc.id,
                message: result.message,
                hint: "Manual review required before inventory release.",
              }).catch(() => {});
              return "skipped" as const;
            } catch (err) {
              await writeOperationalAlert({
                type: "final_failed_booking_release_error",
                source: "reconcile-final-failed-bookings",
                bookingId: doc.id,
                error: err instanceof Error ? err.message : String(err),
              }).catch(() => {});
              return "failed" as const;
            }
          })
        );
        for (const r of results) {
          if (r === "released") released++;
          else if (r === "skipped") skipped++;
          else failed++;
        }
      }

      if (snap.size < PAGE_SIZE) break;
      cursor = snap.docs[snap.docs.length - 1];
    }

    return NextResponse.json({
      ok: true,
      matched,
      released,
      skipped,
      failed,
      slaHours: FINAL_FAILED_RELEASE_SLA_HOURS,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
