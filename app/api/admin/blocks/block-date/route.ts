/**
 * Block or unblock a full day (admin). Uses blocks collection (Google Calendar–style).
 * POST body: { experienceId, date: "YYYY-MM-DD", action?: "block" | "unblock", boatIds?: string[] }
 * Block: creates one block doc per boat for that day (00:00–23:59:59). Unblock: deletes those blocks.
 * Auth: middleware (admin path) + Bearer BLOCK_SECRET or valid admin session cookie (defence-in-depth).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getSlotStartEnd } from "@/lib/booking/experience-slots";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { timingSafeStringEqual } from "@/lib/booking/secure-compare";

async function isAllowed(request: NextRequest): Promise<boolean> {
  const secret = process.env.BLOCK_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (secret && timingSafeStringEqual(auth, `Bearer ${secret}`)) return true;
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  return unauthorized === null;
}

export async function POST(request: NextRequest) {
  try {
    if (!(await isAllowed(request))) {
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

    const expSnap = await db.collection("experiences").doc(experienceId).get();
    const experienceSlug = expSnap.exists
      ? (typeof (expSnap.data() as { slug?: string })?.slug === "string"
          ? (expSnap.data() as { slug: string }).slug.trim()
          : "")
      : "";
    const experienceIdVariants = getExperienceIdVariants(experienceId, experienceSlug);
    const boatSnaps = await Promise.all(
      experienceIdVariants.map((variantId) =>
        db
          .collection("boats")
          .where("isListingBoat", "==", true)
          .where("experienceIds", "array-contains", variantId)
          .get()
      )
    );
    const seenBoatIds = new Set<string>();
    const allBoatIds: string[] = [];
    for (const snap of boatSnaps) {
      for (const d of snap.docs) {
        if (seenBoatIds.has(d.id)) continue;
        seenBoatIds.add(d.id);
        allBoatIds.push(d.id);
      }
    }
    const boatIds = bodyBoatIds && bodyBoatIds.length > 0
      ? bodyBoatIds.filter((id) => allBoatIds.includes(id))
      : allBoatIds;

    // Central-timezone-aware day boundaries so 7 AM–7 PM Central slots on dateStr are inside the block.
    const { start: dayStart } = getSlotStartEnd(dateStr, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    if (action === "unblock") {
      const blockSnapsByVariant = await Promise.all(
        experienceIdVariants.map((variantId) =>
          db
            .collection("blocks")
            .where("experienceId", "==", variantId)
            .where("startAt", "<=", Timestamp.fromDate(dayEnd))
            .get()
        )
      );
      const mergedBlockDocs: import("firebase-admin").firestore.QueryDocumentSnapshot[] = [];
      const seenBlockDocIds = new Set<string>();
      for (const snap of blockSnapsByVariant) {
        for (const doc of snap.docs) {
          if (seenBlockDocIds.has(doc.id)) continue;
          seenBlockDocIds.add(doc.id);
          mergedBlockDocs.push(doc);
        }
      }
      const toDelete = mergedBlockDocs.filter((doc) => {
        const b = doc.data() as { boatId?: string | null; endAt: { toDate(): Date } };
        const endAt = b.endAt?.toDate?.();
        if (!endAt || endAt.getTime() < dayStart.getTime()) return false;
        if (boatIds.length === 0) return true;
        return b.boatId == null || boatIds.includes(b.boatId);
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
    const batch = db.batch();
    for (const boatId of boatIds) {
      const blockRef = db.collection("blocks").doc();
      batch.set(blockRef, {
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
    await batch.commit();
    return NextResponse.json({ ok: true, date: dateStr, blocksCreated: created });
  } catch (err) {
    console.error("[admin/blocks/block-date]", err);
    return NextResponse.json({ error: "Failed to block date" }, { status: 500 });
  }
}
