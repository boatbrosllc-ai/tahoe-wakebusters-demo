import { NextRequest, NextResponse } from "next/server";
import { getAdminEmailFromSessionCookie, requireAdminSession } from "@/lib/admin-auth-firebase";
import { writeAdminAuditLog } from "@/lib/booking/admin-audit-log";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getSlotStartEnd } from "@/lib/booking/experience-slots";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import type { Block } from "@/lib/booking/types";
import { findBlockConflicts, type BlockConflict } from "@/lib/booking/block-conflict-check";
import { findOverlappingAdminBlocksForWrite } from "@/lib/booking/admin-block-overlap";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
import { parseAdminTicketsBlockedInput } from "@/lib/booking/ticketed-admin-blocks";
import type { Experience } from "@/lib/booking/types";

function toIso(ts: { toDate?: () => Date; seconds?: number }): string | null {
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof (ts as { seconds?: number }).seconds === "number") return new Date((ts as { seconds: number }).seconds * 1000).toISOString();
  return null;
}

function isMissingIndexError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /FAILED_PRECONDITION.*index/i.test(msg);
}

/** Surfaces in-flight checkout holds in 409 responses so operators see which reservation may be interrupted. */
async function enrichBlockConflictsWithHoldExpiry(
  db: import("firebase-admin/firestore").Firestore,
  conflicts: BlockConflict[]
): Promise<(BlockConflict | { type: "hold"; id: string; expiresAt: string | null })[]> {
  return Promise.all(
    conflicts.map(async (c) => {
      if (c.type !== "hold") return c;
      const snap = await db.collection("holds").doc(c.id).get();
      const raw = snap.exists ? (snap.data() as { expiresAt?: { toDate?: () => Date } }).expiresAt : undefined;
      const exp = raw?.toDate?.();
      return { type: "hold" as const, id: c.id, expiresAt: exp ? exp.toISOString() : null };
    })
  );
}

/** GET: list blocks in range. Query: experienceId, from (YYYY-MM-DD or ISO), to (YYYY-MM-DD or ISO), boatId (optional). Includes slug variants so blocks created under a variant experienceId are returned. */
export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const experienceId = request.nextUrl.searchParams.get("experienceId");
    const fromParam = request.nextUrl.searchParams.get("from");
    const toParam = request.nextUrl.searchParams.get("to");
    const boatIdParam = request.nextUrl.searchParams.get("boatId");
    if (!experienceId || !fromParam || !toParam) {
      return NextResponse.json({ error: "experienceId, from, to required" }, { status: 400 });
    }
    const fromStr = fromParam.slice(0, 10);
    const toStr = toParam.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
      return NextResponse.json({ error: "Invalid from/to dates" }, { status: 400 });
    }
    const { start: rangeStart } = getSlotStartEnd(fromStr, 0, 0, 0);
    const { end: rangeEnd } = getSlotStartEnd(toStr, 23, 1, 59);

    const db = getDb();
    const { Timestamp } = getFirestoreExports();

    const expSnap = await db.collection("experiences").doc(experienceId).get();
    const experienceSlug = expSnap.exists && typeof (expSnap.data() as { slug?: string })?.slug === "string"
      ? (expSnap.data() as { slug: string }).slug.trim()
      : "";
    const variantIds = getExperienceIdVariants(experienceId, experienceSlug);
    const fetchBlocksByExperienceId = async () => {
      try {
        return await db
          .collection("blocks")
          .where("experienceId", "==", experienceId)
          .where("startAt", "<=", Timestamp.fromDate(rangeEnd))
          .get();
      } catch (err) {
        if (!isMissingIndexError(err)) throw err;
        console.warn("[admin/blocks GET] missing index for experienceId+startAt; using fallback query");
        return db.collection("blocks").where("experienceId", "==", experienceId).get();
      }
    };
    const fetchBlocksByExperienceSlug = async () => {
      if (!experienceSlug) {
        return { docs: [] } as { docs: import("firebase-admin/firestore").QueryDocumentSnapshot[] };
      }
      try {
        return await db
          .collection("blocks")
          .where("experienceSlug", "==", experienceSlug)
          .where("startAt", "<=", Timestamp.fromDate(rangeEnd))
          .get();
      } catch (err) {
        if (!isMissingIndexError(err)) throw err;
        console.warn("[admin/blocks GET] missing index for experienceSlug+startAt; using fallback query");
        return db.collection("blocks").where("experienceSlug", "==", experienceSlug).get();
      }
    };
    const blocksSnaps = await Promise.all([fetchBlocksByExperienceId(), fetchBlocksByExperienceSlug()]);
    const seenBlockIds = new Set<string>();
    const docs: import("firebase-admin/firestore").QueryDocumentSnapshot[] = [];
    for (const snap of blocksSnaps) {
      for (const doc of snap.docs) {
        if (seenBlockIds.has(doc.id)) continue;
        seenBlockIds.add(doc.id);
        docs.push(doc);
      }
    }

    const blocks = docs
      .map((doc) => {
        const b = doc.data() as Block & { startAt: { toDate(): Date }; endAt: { toDate(): Date }; createdAt: { toDate(): Date } };
        const startAt = b.startAt?.toDate?.();
        const endAt = b.endAt?.toDate?.();
        if (!startAt || !endAt) return null;
        if (endAt.getTime() < rangeStart.getTime()) return null;
        if (boatIdParam && b.boatId !== boatIdParam) return null;
        return {
          id: doc.id,
          experienceId: b.experienceId,
          boatId: b.boatId ?? null,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          note: b.note ?? null,
          slotId: b.slotId ?? null,
          ticketsBlocked:
            typeof b.ticketsBlocked === "number" && Number.isFinite(b.ticketsBlocked) && b.ticketsBlocked > 0
              ? Math.floor(b.ticketsBlocked)
              : null,
          createdAt: toIso(b.createdAt as { toDate?: () => Date; seconds?: number }),
        };
      })
      .filter(Boolean) as {
      id: string;
      experienceId: string;
      boatId: string | null;
      startAt: string;
      endAt: string;
      note: string | null;
      slotId: string | null;
      ticketsBlocked: number | null;
      createdAt: string | null;
    }[];

    blocks.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return NextResponse.json(blocks);
  } catch (err) {
    console.error("[admin/blocks GET]", err);
    return NextResponse.json({ error: "Failed to list blocks" }, { status: 500 });
  }
}

/** POST: create one block. Body: experienceId, boatId?, startAt (ISO), endAt (ISO), note?, slotId?, ticketsBlocked? (ticketed partial) */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const experienceId = typeof body?.experienceId === "string" ? body.experienceId : null;
    const startAtRaw = typeof body?.startAt === "string" ? body.startAt : null;
    const endAtRaw = typeof body?.endAt === "string" ? body.endAt : null;
    const boatId = typeof body?.boatId === "string" ? body.boatId.trim() || null : null;
    const note = typeof body?.note === "string" ? body.note.trim() || null : null;
    const slotId = typeof body?.slotId === "string" ? body.slotId.trim() || null : null;
    const ticketsBlockedParsed = parseAdminTicketsBlockedInput(body?.ticketsBlocked);
    if (ticketsBlockedParsed === null) {
      return NextResponse.json({ error: "ticketsBlocked must be a positive integer when provided" }, { status: 400 });
    }
    if (!experienceId || !startAtRaw || !endAtRaw) {
      return NextResponse.json({ error: "experienceId, startAt, endAt required" }, { status: 400 });
    }
    const startAt = new Date(startAtRaw);
    const endAt = new Date(endAtRaw);
    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime()) || startAt >= endAt) {
      return NextResponse.json({ error: "Invalid startAt/endAt" }, { status: 400 });
    }

    const db = getDb();
    const { FieldValue, Timestamp } = getFirestoreExports();
    const now = new Date();
    const expSnap = await db.collection("experiences").doc(experienceId).get();
    const expData = expSnap.exists ? (expSnap.data() as Experience & { slug?: string }) : null;
    const experienceSlug = expData && typeof expData.slug === "string" ? expData.slug.trim() : "";
    const variantIds = getExperienceIdVariants(experienceId, experienceSlug);
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
    if (!isPartialTicketBlock) {
      const conflicts = await findBlockConflicts({
        db,
        variantIds,
        blockStart: startAt,
        blockEnd: endAt,
        boatId,
        now,
      });
      if (conflicts.length > 0) {
        const conflictsDetailed = await enrichBlockConflictsWithHoldExpiry(db, conflicts);
        return NextResponse.json(
          { error: "Block overlaps active holds or bookings", conflicts: conflictsDetailed },
          { status: 409 }
        );
      }
    }
    if (!isPartialTicketBlock) {
      const blockOverlaps = await findOverlappingAdminBlocksForWrite({
        db,
        Timestamp,
        experienceId,
        experienceSlug,
        variantIds,
        intervalStart: startAt,
        intervalEnd: endAt,
        boatId,
      });
      if (blockOverlaps.length > 0) {
        return NextResponse.json(
          { error: "This time range overlaps an existing admin block", blockOverlaps },
          { status: 409 }
        );
      }
    }
    const adminEmail = await getAdminEmailFromSessionCookie(request.headers.get("cookie"));

    const doc = await db.collection("blocks").add({
      // Invariant: store both canonical id and slug so display/enforcement paths can query either key.
      experienceId,
      experienceCanonicalId: experienceId,
      experienceSlug: experienceSlug || null,
      slugVariants: variantIds,
      boatId: boatId ?? null,
      startAt: Timestamp.fromDate(startAt),
      endAt: Timestamp.fromDate(endAt),
      note: note ?? null,
      slotId: slotId ?? null,
      ...(ticketsBlockedParsed != null ? { ticketsBlocked: ticketsBlockedParsed } : {}),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: adminEmail ?? null,
    });

    void writeAdminAuditLog("block_create", {
      blockId: doc.id,
      experienceId,
      boatId: boatId ?? null,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      ...(ticketsBlockedParsed != null ? { ticketsBlocked: ticketsBlockedParsed } : {}),
      adminEmail,
    });

    return NextResponse.json({
      id: doc.id,
      experienceId,
      boatId: boatId ?? null,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      note: note ?? null,
      slotId: slotId ?? null,
      ...(ticketsBlockedParsed != null ? { ticketsBlocked: ticketsBlockedParsed } : {}),
    });
  } catch (err) {
    console.error("[admin/blocks POST]", err);
    return NextResponse.json({ error: "Failed to create block" }, { status: 500 });
  }
}
