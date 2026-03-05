/**
 * Cleanup expired holds: set slot back to open, set hold status to expired.
 * Call via cron (e.g. Vercel Cron, or on-demand with a secret key).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getDepartureInventoryRef, releaseCapacity } from "@/lib/booking/shared-departure-inventory";
import { parseSlotId } from "@/lib/booking/experience-slots";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 503 });
    }
    const db = getDb();
    const { FieldValue, Timestamp } = getFirestoreExports();
    const now = Timestamp.now();
    const holdsSnap = await db.collection("holds").where("status", "==", "active").where("expiresAt", "<", now).limit(100).get();
    let released = 0;

    const releaseHold = async (doc: (typeof holdsSnap.docs)[0]): Promise<boolean> => {
      const hold = doc.data();
      const boatId = hold.boatId as string | undefined;
      const experienceId = hold.experienceId as string | undefined;
      const slotId = hold.slotId as string;
      if (!slotId || (!boatId && !experienceId)) return false;
      const isSharedHold = (hold as { bookingMode?: string }).bookingMode === "shared";
      const dateStr =
        (hold as { startDateStr?: string }).startDateStr ?? parseSlotId(slotId)?.dateStr ?? "";
      const slotRef = boatId
        ? db.collection("boats").doc(boatId).collection("slots").doc(slotId)
        : db.collection("experiences").doc(experienceId!).collection("slots").doc(slotId);
      await db.runTransaction(async (tx) => {
        const slotSnap = await tx.get(slotRef);
        if (!slotSnap.exists) {
          if (isSharedHold && experienceId && dateStr) {
            const inventoryRef = getDepartureInventoryRef(db, experienceId, dateStr);
            await releaseCapacity(tx, inventoryRef, (hold.partySize as number) ?? 0);
          }
          tx.update(doc.ref, { status: "expired" });
          return;
        }
        const slot = slotSnap.data();
        if (slot?.holdId !== doc.id) return;
        tx.update(slotRef, {
          status: "open",
          holdId: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.update(doc.ref, { status: "expired" });
      });
      return true;
    };

    // Process in parallel batches of 10 — holds operate on distinct slot docs so there are no conflicts
    const BATCH_SIZE = 10;
    for (let i = 0; i < holdsSnap.docs.length; i += BATCH_SIZE) {
      const batch = holdsSnap.docs.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map((doc) => releaseHold(doc).catch(() => false)));
      released += results.filter(Boolean).length;
    }
    return NextResponse.json({ ok: true, released });
  } catch (err) {
    console.error("[cleanup-holds]", err);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
