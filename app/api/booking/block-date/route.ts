/**
 * Block or unblock all slots for a date (admin).
 * POST body: { experienceId, date: "YYYY-MM-DD", action?: "block" | "unblock" }
 * Default action is "block". Unblock deletes slot docs so the date becomes available again.
 * Auth: Bearer BLOCK_SECRET/SEED_SECRET, or valid admin session cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import {
  buildSlotId,
  EXPERIENCE_START_HOURS,
  getSlotStartEnd,
} from "@/lib/booking/experience-slots";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import type { ExperienceRate } from "@/lib/booking/types";

async function isAllowed(request: NextRequest): Promise<boolean> {
  const secret = process.env.BLOCK_SECRET ?? process.env.SEED_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  return unauthorized === null;
}

export async function POST(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === "production" && !(await isAllowed(request))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json();
    const experienceId = typeof body?.experienceId === "string" ? body.experienceId : null;
    const dateStr = typeof body?.date === "string" ? body.date : null;
    const action = body?.action === "unblock" ? "unblock" : "block";
    if (!experienceId || !dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: "experienceId and date (YYYY-MM-DD) required" }, { status: 400 });
    }
    const db = getDb();
    const { FieldValue, Timestamp } = getFirestoreExports();
    const slotsRef = db.collection("experiences").doc(experienceId).collection("slots");

    if (action === "unblock") {
      const dayStart = new Date(dateStr + "T00:00:00");
      const dayEnd = new Date(dateStr + "T23:59:59.999");
      const snap = await slotsRef
        .where("startAt", ">=", Timestamp.fromDate(dayStart))
        .where("startAt", "<=", Timestamp.fromDate(dayEnd))
        .get();
      const BATCH_SIZE = 500;
      let batch = db.batch();
      let batchCount = 0;
      for (const doc of snap.docs) {
        batch.delete(doc.ref);
        batchCount++;
        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
      if (batchCount > 0) await batch.commit();
      return NextResponse.json({ ok: true, date: dateStr, action: "unblock", slotsUnblocked: snap.size });
    }

    const ratesSnap = await db
      .collection("experiences")
      .doc(experienceId)
      .collection("rates")
      .where("active", "==", true)
      .get();
    const durations = Array.from(new Set(ratesSnap.docs.map((d) => (d.data() as ExperienceRate).durationHours)));
    if (durations.length === 0) {
      return NextResponse.json({ error: "Experience has no rates" }, { status: 400 });
    }
    const BATCH_SIZE = 500;
    let batch = db.batch();
    let batchCount = 0;
    let totalSlots = 0;
    for (const startHour of EXPERIENCE_START_HOURS) {
      for (const durationHours of durations) {
        const slotId = buildSlotId(dateStr, startHour, durationHours);
        const { start, end } = getSlotStartEnd(dateStr, startHour, durationHours);
        batch.set(slotsRef.doc(slotId), {
          startAt: Timestamp.fromDate(start),
          endAt: Timestamp.fromDate(end),
          status: "blocked",
          holdId: null,
          bookingId: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
        batchCount++;
        totalSlots++;
        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
    }
    if (batchCount > 0) await batch.commit();
    return NextResponse.json({ ok: true, date: dateStr, slotsBlocked: totalSlots });
  } catch (err) {
    console.error("[block-date]", err);
    return NextResponse.json({ error: "Failed to block date" }, { status: 500 });
  }
}
