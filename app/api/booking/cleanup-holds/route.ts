/**
 * Cleanup expired holds: set slot back to open, set hold status to expired.
 * Call via cron (e.g. Vercel Cron, or on-demand with a secret key).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const db = getDb();
    const { FieldValue, Timestamp } = getFirestoreExports();
    const now = Timestamp.now();
    const holdsSnap = await db.collection("holds").where("status", "==", "active").where("expiresAt", "<", now).limit(100).get();
    let released = 0;
    for (const doc of holdsSnap.docs) {
      const hold = doc.data();
      const boatId = hold.boatId as string | undefined;
      const experienceId = hold.experienceId as string | undefined;
      const slotId = hold.slotId as string;
      if (!slotId || (!boatId && !experienceId)) continue;
      const slotRef = experienceId
        ? db.collection("experiences").doc(experienceId).collection("slots").doc(slotId)
        : db.collection("boats").doc(boatId!).collection("slots").doc(slotId);
      await db.runTransaction(async (tx) => {
        const slotSnap = await tx.get(slotRef);
        if (!slotSnap.exists) return;
        const slot = slotSnap.data();
        if (slot?.holdId !== doc.id) return;
        tx.update(slotRef, {
          status: "open",
          holdId: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.update(doc.ref, { status: "expired" });
      });
      released++;
      // Small delay between transactions to smooth write rate and avoid RESOURCE_EXHAUSTED
      if (released < holdsSnap.docs.length) {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    return NextResponse.json({ ok: true, released });
  } catch (err) {
    console.error("[cleanup-holds]", err);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
