import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { assertCronPostAuthorized } from "@/lib/booking/cron-auth";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";

const RETENTION_DAYS = 7;
const PAGE_SIZE = 300;

/** Deletes stale admin blocks (endAt older than retention window). */
export async function POST(request: NextRequest) {
  const authErr = await assertCronPostAuthorized(request);
  if (authErr) return authErr;
  try {
    const db = getDb();
    const { Timestamp } = getFirestoreExports();
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const cutoffTs = Timestamp.fromDate(cutoff);
    let deleted = 0;
    let cursor: QueryDocumentSnapshot | null = null;
    while (true) {
      let query = db
        .collection("blocks")
        .where("endAt", "<", cutoffTs)
        .limit(PAGE_SIZE);
      if (cursor) query = query.startAfter(cursor);
      const snap = await query.get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += snap.size;
      cursor = snap.docs[snap.docs.length - 1];
      if (snap.size < PAGE_SIZE) break;
    }
    return NextResponse.json({ ok: true, deleted, retentionDays: RETENTION_DAYS });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
