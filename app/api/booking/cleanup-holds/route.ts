/**
 * Cleanup expired holds: set slot back to open, set hold status to expired.
 * Call via cron (e.g. Vercel Cron, or on-demand with a secret key).
 *
 * Pagination: iterates all eligible holds using cursor-based pages until no
 * results remain. Emits per-run metrics: matched, processed, skipped, failed.
 */

import { NextRequest, NextResponse } from "next/server";
import type { QueryDocumentSnapshot, DocumentData } from "firebase-admin/firestore";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getDepartureInventoryRef, releaseCapacity } from "@/lib/booking/shared-departure-inventory";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { getCleanupHoldSlotAction } from "@/lib/booking/cleanup-holds-logic";

const PAGE_SIZE = 100;
const BATCH_SIZE = 10;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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
      const hold = doc.data();
      const boatId = hold.boatId as string | undefined;
      const experienceId = hold.experienceId as string | undefined;
      const slotId = hold.slotId as string;
      if (!slotId || (!boatId && !experienceId)) return "skipped";
      const isSharedHold = (hold as { bookingMode?: string }).bookingMode === "shared";
      const dateStr =
        (hold as { startDateStr?: string }).startDateStr ?? parseSlotId(slotId)?.dateStr ?? "";
      const slotRef = boatId
        ? db.collection("boats").doc(boatId).collection("slots").doc(slotId)
        : db.collection("experiences").doc(experienceId!).collection("slots").doc(slotId);
      let didUpdate = false;
      try {
        await db.runTransaction(async (tx) => {
          const slotSnap = await tx.get(slotRef);
          if (!slotSnap.exists) {
            if (isSharedHold && experienceId && dateStr) {
              const inventoryRef = getDepartureInventoryRef(db, experienceId, dateStr);
              await releaseCapacity(tx, inventoryRef, (hold.partySize as number) ?? 0);
            }
            tx.update(doc.ref, { status: "expired" });
            didUpdate = true;
            return;
          }
          const slot = slotSnap.data();
          const action = getCleanupHoldSlotAction(slot?.holdId, doc.id);
          if (action === "release_slot_and_expire") {
            tx.update(slotRef, {
              status: "open",
              holdId: FieldValue.delete(),
              updatedAt: FieldValue.serverTimestamp(),
            });
          } else {
            // expire_only: slot was reassigned to another hold; still expire this hold and release shared capacity.
            if (isSharedHold && experienceId && dateStr) {
              const inventoryRef = getDepartureInventoryRef(db, experienceId, dateStr);
              await releaseCapacity(tx, inventoryRef, (hold.partySize as number) ?? 0);
            }
          }
          tx.update(doc.ref, { status: "expired" });
          didUpdate = true;
        });
        return didUpdate ? "processed" : "skipped";
      } catch {
        return "failed";
      }
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

    return NextResponse.json({ ok: true, matched, processed, skipped, failed });
  } catch (err) {
    console.error("[cleanup-holds]", err);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
