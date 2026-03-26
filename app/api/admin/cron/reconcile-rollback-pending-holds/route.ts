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
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";

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

    // Reconcile ticketed departure inventory counters against canonical bookings.
    let inventoryReconciled = 0;
    const ticketedExpSnap = await db.collection("experiences").where("pricingType", "==", "ticketed").get();
    for (const expDoc of ticketedExpSnap.docs) {
      const expId = expDoc.id;
      const exp = expDoc.data() as { maxCapacity?: number };
      const maxCapacity = typeof exp.maxCapacity === "number" && Number.isFinite(exp.maxCapacity) ? exp.maxCapacity : 0;
      if (maxCapacity <= 0) continue;

      const invSnap = await db.collection("departureInventory").where(FieldPath.documentId(), ">=", `${expId}_`).get();
      for (const invDoc of invSnap.docs) {
        if (!invDoc.id.startsWith(`${expId}_`)) continue;
        const dateStr = invDoc.id.slice(expId.length + 1);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
        const bookingsSnap = await db
          .collection("bookings")
          .where("experienceId", "==", expId)
          .where("startDateStr", "==", dateStr)
          .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
          .get();
        let sold = 0;
        for (const b of bookingsSnap.docs) {
          const partySize = (b.data() as { partySize?: number }).partySize;
          if (typeof partySize === "number" && Number.isFinite(partySize)) sold += partySize;
        }
        const reserved = (invDoc.data() as { reservedSeats?: number }).reservedSeats ?? 0;
        if (sold + reserved > maxCapacity || reserved < 0) {
          const correctedReserved = Math.max(0, maxCapacity - sold);
          await invDoc.ref.set(
            {
              reservedSeats: correctedReserved,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          inventoryReconciled++;
        }
      }
    }

    return NextResponse.json({ ok: true, matched, released, skipped, failed, inventoryReconciled });
  } catch (err) {
    console.error("[admin/cron/reconcile-rollback-pending-holds]", err);
    return NextResponse.json({ error: "Reconcile failed" }, { status: 500 });
  }
}
