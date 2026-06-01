/**
 * Block or unblock a full day (admin). Uses blocks collection (Google Calendar–style).
 * POST body: { experienceId, date: "YYYY-MM-DD", action?: "block" | "unblock", boatIds?: string[], includePartial?: boolean, ticketsBlocked?: number }
 * Block: creates one block doc per boat for that calendar day (Central bounds from getCentralCalendarDayBounds).
 * Unblock (includePartial false, default): deletes only full-day blocks matching that day exactly.
 * Unblock (includePartial true): deletes every block whose interval overlaps that calendar day.
 * Auth: middleware (admin path) + Bearer BLOCK_SECRET or valid admin session cookie (defence-in-depth).
 */

import type { Firestore } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getCentralCalendarDayBounds } from "@/lib/booking/experience-slots";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { getAdminEmailFromSessionCookie, requireAdminSession } from "@/lib/admin-auth-firebase";
import { timingSafeStringEqual } from "@/lib/booking/secure-compare";
import { findBlockConflicts, type BlockConflict } from "@/lib/booking/block-conflict-check";
import { findOverlappingAdminBlocksForWrite } from "@/lib/booking/admin-block-overlap";
import { writeAdminAuditLog } from "@/lib/booking/admin-audit-log";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
import { parseAdminTicketsBlockedInput } from "@/lib/booking/ticketed-admin-blocks";
import type { Experience } from "@/lib/booking/types";

/** One conflict check per target boat (or whole experience when `null`), deduped by type+id. */
async function findBlockConflictsMergedForTargets(
  db: Firestore,
  variantIds: string[],
  blockStart: Date,
  blockEnd: Date,
  now: Date,
  targets: (string | null)[]
): Promise<BlockConflict[]> {
  const seen = new Set<string>();
  const out: BlockConflict[] = [];
  for (const boatId of targets) {
    const chunk = await findBlockConflicts({
      db,
      variantIds,
      blockStart,
      blockEnd,
      boatId: typeof boatId === "string" ? boatId : undefined,
      now,
    });
    for (const c of chunk) {
      const k = `${c.type}:${c.id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
  }
  return out;
}

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
    const includePartial = body?.includePartial === true;
    const bodyBoatIds = Array.isArray(body?.boatIds) ? (body.boatIds as unknown[]).filter((id): id is string => typeof id === "string").filter(Boolean) : null;
    const ticketsBlockedParsed = parseAdminTicketsBlockedInput(body?.ticketsBlocked);
    if (ticketsBlockedParsed === null) {
      return NextResponse.json({ error: "ticketsBlocked must be a positive integer when provided" }, { status: 400 });
    }
    if (!experienceId || !dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: "experienceId and date (YYYY-MM-DD) required" }, { status: 400 });
    }
    const db = getDb();
    const { FieldValue, Timestamp } = getFirestoreExports();

    const expSnap = await db.collection("experiences").doc(experienceId).get();
    const expData = expSnap.exists ? (expSnap.data() as Experience & { slug?: string }) : null;
    const experienceSlug = expData && typeof expData.slug === "string" ? expData.slug.trim() : "";
    const experienceIdVariants = getExperienceIdVariants(experienceId, experienceSlug);
    const isTicketed = expData?.pricingType === "ticketed";
    if (ticketsBlockedParsed != null && !isTicketed) {
      return NextResponse.json(
        { error: "ticketsBlocked is only supported for ticketed trip types" },
        { status: 400 },
      );
    }
    if (ticketsBlockedParsed != null && expData) {
      const maxTickets = getMaxGuestsForExperience({
        pricingType: "ticketed",
        maxCapacity: expData.maxCapacity,
        maxGuests: expData.maxGuests,
        slug: expData.slug,
        title: expData.title,
      });
      if (ticketsBlockedParsed > maxTickets) {
        return NextResponse.json(
          { error: `Cannot hold back more than ${maxTickets} tickets for this listing` },
          { status: 400 },
        );
      }
    }
    const isPartialTicketBlock = ticketsBlockedParsed != null;
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

    const { dayStart, dayEnd } = getCentralCalendarDayBounds(dateStr);
    const now = new Date();

    if (action === "block" && !isPartialTicketBlock) {
      const conflictTargets = boatIds.length > 0 ? boatIds : [null];
      const conflicts = await findBlockConflictsMergedForTargets(
        db,
        experienceIdVariants,
        dayStart,
        dayEnd,
        now,
        conflictTargets
      );
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
      const boatMatchesUnblockFilter = (b: { boatId?: string | null }) => {
        if (boatIds.length === 0) return true;
        if (b.boatId == null) return true;
        return boatIds.includes(b.boatId as string);
      };
      const overlapsTargetDay = (startAt: Date, endAt: Date) =>
        startAt.getTime() <= dayEnd.getTime() && endAt.getTime() >= dayStart.getTime();
      const isFullDayBlockForThisDate = (b: {
        slotId?: string | null;
        startAt?: { toDate?: () => Date };
        endAt?: { toDate?: () => Date };
      }) => {
        if ((b.slotId ?? null) !== null) return false;
        const startAt = b.startAt?.toDate?.();
        const endAt = b.endAt?.toDate?.();
        if (!startAt || !endAt) return false;
        return (
          startAt.getTime() === dayStart.getTime() &&
          endAt.getTime() === dayEnd.getTime()
        );
      };
      const toDelete = mergedBlockDocs.filter((doc) => {
        const b = doc.data() as {
          boatId?: string | null;
          slotId?: string | null;
          startAt?: { toDate?: () => Date };
          endAt?: { toDate?: () => Date };
        };
        const startAt = b.startAt?.toDate?.();
        const endAt = b.endAt?.toDate?.();
        if (!startAt || !endAt || !overlapsTargetDay(startAt, endAt)) return false;
        if (!boatMatchesUnblockFilter(b)) return false;
        if (includePartial) return true;
        return isFullDayBlockForThisDate(b);
      });
      const toDeleteIds = new Set(toDelete.map((d) => d.id));
      const timedOrPartialBlocksSkipped = includePartial
        ? 0
        : mergedBlockDocs.filter((doc) => {
            const b = doc.data() as {
              boatId?: string | null;
              startAt?: { toDate?: () => Date };
              endAt?: { toDate?: () => Date };
            };
            const startAt = b.startAt?.toDate?.();
            const endAt = b.endAt?.toDate?.();
            if (!startAt || !endAt || !overlapsTargetDay(startAt, endAt)) return false;
            if (!boatMatchesUnblockFilter(b)) return false;
            return !toDeleteIds.has(doc.id);
          }).length;
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
      return NextResponse.json({
        ok: true,
        date: dateStr,
        action: "unblock",
        includePartial,
        blocksDeleted: toDelete.length,
        timedOrPartialBlocksSkipped,
      });
    }

    let created = 0;
    let existing = 0;
    const batch = db.batch();
    const createTargets = boatIds.length > 0 ? boatIds : [null];
    const createdBlockMeta: { ref: FirebaseFirestore.DocumentReference; boatId: string | null }[] = [];
    const boatOutcomes: { boatId: string | null; outcome: "created" | "skipped_existing_full_day" }[] = [];
    for (const boatId of createTargets) {
      const targetBoatId = typeof boatId === "string" ? boatId : null;
      if (!isPartialTicketBlock) {
        const existingSnap = await db
          .collection("blocks")
          .where("experienceId", "==", experienceId)
          .where("startAt", "<=", Timestamp.fromDate(dayEnd))
          .get();
        const alreadyExists = existingSnap.docs.some((doc) => {
          const b = doc.data() as {
            boatId?: string | null;
            startAt?: { toDate?: () => Date };
            endAt?: { toDate?: () => Date };
            slotId?: string | null;
          };
          if ((b.slotId ?? null) !== null) return false;
          const startAt = b.startAt?.toDate?.();
          const endAt = b.endAt?.toDate?.();
          if (!startAt || !endAt) return false;
          if (startAt.getTime() !== dayStart.getTime() || endAt.getTime() !== dayEnd.getTime()) return false;
          const docBoat = typeof b.boatId === "string" ? b.boatId : null;
          const targetBoat = typeof boatId === "string" ? boatId : null;
          return docBoat === targetBoat;
        });
        if (alreadyExists) {
          existing++;
          boatOutcomes.push({ boatId: typeof boatId === "string" ? boatId : null, outcome: "skipped_existing_full_day" });
          continue;
        }
        const blockOverlaps = await findOverlappingAdminBlocksForWrite({
          db,
          Timestamp,
          experienceId,
          experienceSlug,
          variantIds: experienceIdVariants,
          intervalStart: dayStart,
          intervalEnd: dayEnd,
          boatId: targetBoatId,
        });
        if (blockOverlaps.length > 0) {
          existing++;
          boatOutcomes.push({ boatId: targetBoatId, outcome: "skipped_existing_full_day" });
          continue;
        }
      }
      const blockRef = db.collection("blocks").doc();
      createdBlockMeta.push({ ref: blockRef, boatId: targetBoatId });
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
        ...(ticketsBlockedParsed != null ? { ticketsBlocked: ticketsBlockedParsed } : {}),
        createdAt: FieldValue.serverTimestamp(),
        createdBy: auth.actorType === "admin_session" ? auth.adminEmail ?? null : null,
      });
      boatOutcomes.push({ boatId: typeof boatId === "string" ? boatId : null, outcome: "created" });
      created++;
    }
    await batch.commit();
    // Post-write conflict verification to shrink TOCTOU window; rollback created blocks on conflict.
    if (createdBlockMeta.length > 0 && !isPartialTicketBlock) {
      const verifyKeys = Array.from(new Set(createdBlockMeta.map((m) => (m.boatId == null ? "__EXP__" : m.boatId))));
      for (const key of verifyKeys) {
        const boatForVerify = key === "__EXP__" ? null : key;
        const postConflicts = await findBlockConflicts({
          db,
          variantIds: experienceIdVariants,
          blockStart: dayStart,
          blockEnd: dayEnd,
          boatId: boatForVerify ?? undefined,
          now,
        });
        if (postConflicts.length > 0) {
          const rollbackBatch = db.batch();
          for (const { ref } of createdBlockMeta) rollbackBatch.delete(ref);
          await rollbackBatch.commit();
          return NextResponse.json(
            { error: "Block overlaps active holds or bookings", conflicts: postConflicts },
            { status: 409 }
          );
        }
      }
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
    return NextResponse.json({
      ok: true,
      date: dateStr,
      blocksCreated: created,
      blocksExisting: existing,
      boatOutcomes,
    });
  } catch (err) {
    console.error("[admin/blocks/block-date]", err);
    return NextResponse.json({ error: "Failed to block date" }, { status: 500 });
  }
}
