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
import { getAdminEmailFromSessionCookie, requireAdminSession } from "@/lib/admin-auth-firebase";
import { timingSafeStringEqual } from "@/lib/booking/secure-compare";
import { findBlockConflicts } from "@/lib/booking/block-conflict-check";
import { writeAdminAuditLog } from "@/lib/booking/admin-audit-log";

async function resolveBlockDateAuth(
  request: NextRequest
): Promise<{ ok: boolean; adminEmail: string | null; actorType: "admin_session" | "block_secret_automation" }> {
  const secret = process.env.BLOCK_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (secret && timingSafeStringEqual(auth, `Bearer ${secret}`)) {
    return { ok: true, adminEmail: null, actorType: "block_secret_automation" };
  }
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return { ok: false, adminEmail: null, actorType: "admin_session" };
  const adminEmail = await getAdminEmailFromSessionCookie(request.headers.get("cookie"));
  return { ok: true, adminEmail, actorType: "admin_session" };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveBlockDateAuth(request);
    if (!auth.ok) {
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
    const now = new Date();

    if (action === "block") {
      const conflicts = await findBlockConflicts({
        db,
        variantIds: experienceIdVariants,
        blockStart: dayStart,
        blockEnd: dayEnd,
        now,
      });
      if (conflicts.length > 0) {
        return NextResponse.json(
          { error: "Block overlaps active holds or bookings", conflicts },
          { status: 409 }
        );
      }
    }

    if (action === "unblock") {
      const [canonicalSnap, slugSnap] = await Promise.all([
        db
          .collection("blocks")
          .where("experienceId", "==", experienceId)
          .where("startAt", "<=", Timestamp.fromDate(dayEnd))
          .get(),
        experienceSlug
          ? db
              .collection("blocks")
              .where("experienceSlug", "==", experienceSlug)
              .where("startAt", "<=", Timestamp.fromDate(dayEnd))
              .get()
          : Promise.resolve({ docs: [] } as { docs: import("firebase-admin").firestore.QueryDocumentSnapshot[] }),
      ]);
      const mergedBlockDocs: import("firebase-admin").firestore.QueryDocumentSnapshot[] = [];
      const seenBlockDocIds = new Set<string>();
      for (const snap of [canonicalSnap, slugSnap]) {
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
        if (b.boatId == null) return true;
        return boatIds.includes(b.boatId);
      });
      const BATCH_SIZE = 500;
      for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
        const batch = db.batch();
        toDelete.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      void writeAdminAuditLog("block_date", {
        action: "unblock",
        experienceId,
        dateStr,
        boatIds,
        blocksDeleted: toDelete.length,
        adminEmail: auth.adminEmail,
        actorType: auth.actorType,
      });
      return NextResponse.json({ ok: true, date: dateStr, action: "unblock", blocksDeleted: toDelete.length });
    }

    let created = 0;
    let existing = 0;
    const batch = db.batch();
    const createTargets = boatIds.length > 0 ? boatIds : [null];
    const createdBlockRefs: FirebaseFirestore.DocumentReference[] = [];
    for (const boatId of createTargets) {
      const existingSnap = await db
        .collection("blocks")
        .where("experienceId", "==", experienceId)
        .where("startAt", "<=", Timestamp.fromDate(dayEnd))
        .get();
      const alreadyExists = existingSnap.docs.some((doc) => {
        const b = doc.data() as {
          boatId?: string | null;
          endAt?: { toDate?: () => Date };
          slotId?: string | null;
        };
        const endAt = b.endAt?.toDate?.();
        if (!endAt || endAt.getTime() < dayStart.getTime()) return false;
        if ((b.slotId ?? null) !== null) return false;
        const docBoat = typeof b.boatId === "string" ? b.boatId : null;
        const targetBoat = typeof boatId === "string" ? boatId : null;
        return docBoat === targetBoat;
      });
      if (alreadyExists) {
        existing++;
        continue;
      }
      const blockRef = db.collection("blocks").doc();
      createdBlockRefs.push(blockRef);
      batch.set(blockRef, {
        experienceId,
        experienceCanonicalId: experienceId,
        experienceSlug: experienceSlug || null,
        slugVariants: experienceIdVariants,
        boatId,
        startAt: Timestamp.fromDate(dayStart),
        endAt: Timestamp.fromDate(dayEnd),
        note: null,
        slotId: null,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: auth.actorType === "admin_session" ? auth.adminEmail ?? null : null,
      });
      created++;
    }
    await batch.commit();
    // Post-write conflict verification to shrink TOCTOU window; rollback created blocks on conflict.
    const postConflicts = await findBlockConflicts({
      db,
      variantIds: experienceIdVariants,
      blockStart: dayStart,
      blockEnd: dayEnd,
      now,
    });
    if (postConflicts.length > 0) {
      const rollbackBatch = db.batch();
      for (const ref of createdBlockRefs) rollbackBatch.delete(ref);
      await rollbackBatch.commit();
      return NextResponse.json(
        { error: "Block overlaps active holds or bookings", conflicts: postConflicts },
        { status: 409 }
      );
    }
    void writeAdminAuditLog("block_date", {
      action: "block",
      experienceId,
      dateStr,
      boatIds,
      blocksCreated: created,
      blocksExisting: existing,
      adminEmail: auth.adminEmail,
      actorType: auth.actorType,
    });
    return NextResponse.json({ ok: true, date: dateStr, blocksCreated: created, blocksExisting: existing });
  } catch (err) {
    console.error("[admin/blocks/block-date]", err);
    return NextResponse.json({ error: "Failed to block date" }, { status: 500 });
  }
}
