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
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { bookingError } from "@/lib/booking/debug";

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
        const [bookingsSnap, holdsSnap] = await Promise.all([
          db
            .collection("bookings")
            .where("experienceId", "==", expId)
            .where("startDateStr", "==", dateStr)
            .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
            .get(),
          db
            .collection("holds")
            .where("experienceId", "==", expId)
            .where("startDateStr", "==", dateStr)
            .where("status", "==", "active")
            .get(),
        ]);

        let sold = 0;
        for (const b of bookingsSnap.docs) {
          const partySize = (b.data() as { partySize?: number }).partySize;
          if (typeof partySize === "number" && Number.isFinite(partySize)) sold += partySize;
        }

        const now = new Date();
        let activeHeldSeats = 0;
        for (const h of holdsSnap.docs) {
          const hold = h.data() as {
            partySize?: number;
            expiresAt?: { toDate?: () => Date; seconds?: number };
          };
          const exp = hold.expiresAt;
          const expiresAt =
            exp?.toDate?.() ?? (typeof exp?.seconds === "number" ? new Date(exp.seconds * 1000) : new Date(0));
          if (expiresAt <= now) continue;
          const partySize = hold.partySize;
          if (typeof partySize === "number" && Number.isFinite(partySize) && partySize > 0) {
            activeHeldSeats += partySize;
          }
        }

        const currentReservedRaw = (invDoc.data() as { reservedSeats?: number } | undefined)?.reservedSeats ?? 0;
        const currentReserved = Number.isFinite(currentReservedRaw) ? currentReservedRaw : 0;
        const needsCorrection = sold + currentReserved > maxCapacity || currentReserved !== activeHeldSeats;
        if (!needsCorrection) continue;

        let corrected = false;
        try {
          corrected = await db.runTransaction(async (tx) => {
            const invSnapTx = await tx.get(invDoc.ref);
            const currentReservedTxRaw = (invSnapTx.data() as { reservedSeats?: number } | undefined)?.reservedSeats ?? 0;
            const currentReservedTx = Number.isFinite(currentReservedTxRaw) ? currentReservedTxRaw : 0;
            if (currentReservedTx !== currentReserved) return false;

            tx.set(
              invDoc.ref,
              {
                reservedSeats: activeHeldSeats,
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
            return true;
          });
        } catch (txErr) {
          await writeOperationalAlert({
            type: "reconcile_rollback_pending_holds_inventory_reserved_seats_tx_failed",
            source: "reconcile-rollback-pending-holds",
            experienceId: expId,
            dateStr,
            inventoryDocId: invDoc.id,
            lastError: txErr instanceof Error ? txErr.message : String(txErr),
          }).catch(() => {});
        }
        if (corrected) inventoryReconciled++;
      }
    }

    const RECONCILE_ROLLBACK_FAILURE_ALERT_THRESHOLD = (() => {
      const n = parseInt(process.env.RECONCILE_ROLLBACK_FAILURE_ALERT_THRESHOLD ?? "3", 10);
      return Number.isFinite(n) && n >= 1 ? Math.min(n, 100) : 3;
    })();
    if (failed >= RECONCILE_ROLLBACK_FAILURE_ALERT_THRESHOLD) {
      await writeOperationalAlert({
        type: "reconcile_rollback_pending_holds_high_failure_count",
        source: "reconcile-rollback-pending-holds",
        failed,
        matched,
        released,
        skipped,
        threshold: RECONCILE_ROLLBACK_FAILURE_ALERT_THRESHOLD,
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, matched, released, skipped, failed, inventoryReconciled });
  } catch (err) {
    bookingError("reconcile-rollback", "reconcile-rollback-pending-holds failed", err);
    return NextResponse.json({ error: "Reconcile failed" }, { status: 500 });
  }
}
