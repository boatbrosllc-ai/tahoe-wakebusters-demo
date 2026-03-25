/**
 * Reconciles holds stuck with rollbackPending past rollbackPendingExpiresAt:
 * verifies Stripe PaymentIntent status and releases the slot when no succeeded charge is observed.
 * POST with Bearer CRON_SECRET + X-Cron-Timestamp (see assertCronPostAuthorized).
 */

import { NextRequest, NextResponse } from "next/server";
import type { QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";
import { FieldPath } from "firebase-admin/firestore";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import {
  isRollbackPendingPastAutoReleaseDeadline,
  runRollbackPendingAutoResolveTransaction,
} from "@/lib/booking/cleanup-holds-logic";
import { assertCronPostAuthorized } from "@/lib/booking/cron-auth";
import { getStripe } from "@/lib/booking/stripe-client";

const PAGE_SIZE = 50;
const BATCH_SIZE = 5;

export async function POST(request: NextRequest) {
  try {
    const authErr = await assertCronPostAuthorized(request);
    if (authErr) return authErr;

    if (!process.env.STRIPE_SECRET_KEY?.trim()) {
      return NextResponse.json({ ok: false, error: "STRIPE_SECRET_KEY not configured" }, { status: 503 });
    }

    const db = getDb();
    const { FieldValue } = getFirestoreExports();
    const stripe = getStripe();

    let matched = 0;
    let released = 0;
    let skipped = 0;
    let failed = 0;

    let cursor: QueryDocumentSnapshot<DocumentData> | null = null;

    while (true) {
      let q = db
        .collection("holds")
        .where("status", "==", "active")
        .where("rollbackPending", "==", true)
        .orderBy(FieldPath.documentId())
        .limit(PAGE_SIZE);
      if (cursor) q = q.startAfter(cursor);

      const snap = await q.get();
      if (snap.empty) break;

      const eligible = snap.docs.filter((doc) =>
        isRollbackPendingPastAutoReleaseDeadline(doc.data() as Record<string, unknown>)
      );
      matched += eligible.length;

      for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
        const batch = eligible.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map((doc) =>
            runRollbackPendingAutoResolveTransaction(db, FieldValue, doc.ref, stripe).catch(() => "failed" as const)
          )
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

    return NextResponse.json({ ok: true, matched, released, skipped, failed });
  } catch (err) {
    console.error("[admin/cron/reconcile-rollback-pending-holds]", err);
    return NextResponse.json({ error: "Reconcile failed" }, { status: 500 });
  }
}
