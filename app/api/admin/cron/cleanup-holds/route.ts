/**
 * Cleanup expired holds: set slot back to open, set hold status to expired.
 * Under /api/admin/cron/* so middleware runs first; Bearer CRON_SECRET allows access without admin session.
 * Pagination: iterates all eligible holds using cursor-based pages until no results remain.
 */

import { NextRequest, NextResponse } from "next/server";
import type { QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { runExpiredHoldReleaseTransaction } from "@/lib/booking/cleanup-holds-logic";
import { timingSafeStringEqual } from "@/lib/booking/secure-compare";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";

const PAGE_SIZE = 100;
const BATCH_SIZE = 10;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") ?? "";
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || !timingSafeStringEqual(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const db = getDb();
    const { FieldValue, Timestamp } = getFirestoreExports();
    const now = Timestamp.now();

    let matched = 0;
    let processed = 0;
    let skipped = 0;
    let failed = 0;

    const releaseHold = async (doc: QueryDocumentSnapshot<DocumentData>): Promise<"processed" | "skipped" | "failed"> => {
      return runExpiredHoldReleaseTransaction(db, FieldValue, doc).catch(() => "failed" as const);
    };

    let cursor: QueryDocumentSnapshot<DocumentData> | null = null;

    while (true) {
      let q = db
        .collection("holds")
        .where("status", "==", "active")
        .where("expiresAt", "<", now)
        .orderBy("expiresAt", "asc")
        .limit(PAGE_SIZE);

      if (cursor) q = q.startAfter(cursor);

      const holdsSnap = await q.get();
      if (holdsSnap.empty) break;

      matched += holdsSnap.size;

      for (let i = 0; i < holdsSnap.docs.length; i += BATCH_SIZE) {
        const batch = holdsSnap.docs.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map((doc) => releaseHold(doc).catch(() => "failed" as const)));
        for (const r of results) {
          if (r === "processed") processed++;
          else if (r === "skipped") skipped++;
          else failed++;
        }
      }

      if (holdsSnap.size < PAGE_SIZE) break;
      cursor = holdsSnap.docs[holdsSnap.docs.length - 1];
    }

    if (failed > 0) {
      await writeOperationalAlert({
        type: "cleanup_holds_failures",
        source: "api/admin/cron/cleanup-holds",
        failed,
        matched,
        processed,
        skipped,
      });
    }

    return NextResponse.json({ ok: true, matched, processed, skipped, failed });
  } catch (err) {
    console.error("[admin/cron/cleanup-holds]", err);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
