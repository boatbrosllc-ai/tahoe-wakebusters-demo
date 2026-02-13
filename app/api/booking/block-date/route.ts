/**
 * Block or unblock a full day (admin). Uses blocks collection (Google Calendar–style).
 * POST body: { experienceId, date: "YYYY-MM-DD", action?: "block" | "unblock", boatIds?: string[] }
 * Block: creates one block doc per boat for that day (00:00–23:59:59). Unblock: deletes those blocks.
 * Auth: Bearer BLOCK_SECRET/SEED_SECRET, or valid admin session cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { requireAdminSession } from "@/lib/admin-auth-firebase";

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
    const bodyBoatIds = Array.isArray(body?.boatIds) ? (body.boatIds as unknown[]).filter((id): id is string => typeof id === "string").filter(Boolean) : null;
    if (!experienceId || !dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: "experienceId and date (YYYY-MM-DD) required" }, { status: 400 });
    }
    const db = getDb();
    const { FieldValue, Timestamp } = getFirestoreExports();

    const boatsSnap = await db
      .collection("boats")
      .where("isListingBoat", "==", true)
      .where("experienceIds", "array-contains", experienceId)
      .get();
    const allBoatIds = boatsSnap.docs.map((d) => d.id);
    const boatIds = bodyBoatIds && bodyBoatIds.length > 0
      ? bodyBoatIds.filter((id) => allBoatIds.includes(id))
      : allBoatIds;

    const dayStart = new Date(dateStr + "T00:00:00");
    const dayEnd = new Date(dateStr + "T23:59:59.999");

    if (action === "unblock") {
      const blocksSnap = await db
        .collection("blocks")
        .where("experienceId", "==", experienceId)
        .where("startAt", "<=", Timestamp.fromDate(dayEnd))
        .get();
      const toDelete = blocksSnap.docs.filter((doc) => {
        const b = doc.data() as { boatId?: string | null; endAt: { toDate(): Date } };
        const endAt = b.endAt?.toDate?.();
        if (!endAt || endAt.getTime() < dayStart.getTime()) return false;
        if (boatIds.length === 0) return true;
        return b.boatId != null && boatIds.includes(b.boatId);
      });
      const BATCH_SIZE = 500;
      for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
        const batch = db.batch();
        toDelete.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      return NextResponse.json({ ok: true, date: dateStr, action: "unblock", blocksDeleted: toDelete.length });
    }

    let created = 0;
    for (const boatId of boatIds) {
      await db.collection("blocks").add({
        experienceId,
        boatId,
        startAt: Timestamp.fromDate(dayStart),
        endAt: Timestamp.fromDate(dayEnd),
        note: null,
        slotId: null,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: null,
      });
      created++;
    }
    return NextResponse.json({ ok: true, date: dateStr, blocksCreated: created });
  } catch (err) {
    console.error("[block-date]", err);
    return NextResponse.json({ error: "Failed to block date" }, { status: 500 });
  }
}
