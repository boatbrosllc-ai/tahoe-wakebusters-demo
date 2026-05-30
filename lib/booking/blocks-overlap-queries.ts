/**
 * Shared Firestore queries for admin `blocks` overlapping a time window.
 * Boat-specific blocks apply to that boat on every trip type (experience), not only the
 * experienceId stored on the block doc (admin may save under Holiday while customers book Pontoon).
 */
import type { Firestore, Query, QueryDocumentSnapshot, QuerySnapshot } from "firebase-admin/firestore";
import { bookingWarn } from "@/lib/booking/debug";

/** Thrown when the blocks query fails (e.g. missing index). Callers should return 503, not 409 "blocked". */
export class BlockCheckUnavailableError extends Error {
  constructor() {
    super("BLOCK_CHECK_UNAVAILABLE");
    this.name = "BlockCheckUnavailableError";
  }
}

type TimestampConstructor = { fromDate(date: Date): unknown };

export function blockIntervalsOverlapMs(
  blockStartMs: number,
  blockEndMs: number,
  slotStartMs: number,
  slotEndMs: number,
): boolean {
  return blockStartMs < slotEndMs && blockEndMs > slotStartMs;
}

export function blockOverlapsWindowMs(
  blockStartMs: number,
  blockEndMs: number,
  windowStartMs: number,
  windowEndMs: number,
): boolean {
  return blockStartMs <= windowEndMs && blockEndMs >= windowStartMs;
}

type BlockRow = {
  boatId?: string | null;
  startAt?: { toDate?: () => Date };
  endAt?: { toDate?: () => Date };
};

/** True when block row overlaps [slotStart, slotEnd] and matches optional boat scope. */
export function blockRowOverlapsSlot(
  row: BlockRow,
  slotStartMs: number,
  slotEndMs: number,
  boatId: string | null,
): boolean {
  const blockBoatIdRaw = typeof row.boatId === "string" ? row.boatId.trim() : null;
  const blockBoatId = blockBoatIdRaw || null;
  const matchesBoat = boatId ? blockBoatId === boatId || blockBoatId == null : blockBoatId == null;
  if (!matchesBoat) return false;
  const startAt = row.startAt?.toDate?.();
  const endAt = row.endAt?.toDate?.();
  if (!startAt || !endAt) return false;
  return blockIntervalsOverlapMs(startAt.getTime(), endAt.getTime(), slotStartMs, slotEndMs);
}

type BlockQueryResult = { docs: QueryDocumentSnapshot[] };

function mergeUniqueDocs(target: QueryDocumentSnapshot[], seen: Set<string>, snap: BlockQueryResult): void {
  for (const doc of snap.docs) {
    if (seen.has(doc.id)) continue;
    seen.add(doc.id);
    target.push(doc);
  }
}

function isIndexError(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  const message = err instanceof Error ? err.message : String(err);
  return code === "failed-precondition" || /index/i.test(message);
}

async function runIndexedBlockQuery(
  query: Query,
  get: (q: Query) => Promise<QuerySnapshot>,
  context: Record<string, unknown>,
): Promise<BlockQueryResult> {
  try {
    return await get(query);
  } catch (err) {
    if (!isIndexError(err)) throw err;
    if (process.env.BLOCK_CHECK_FAIL_OPEN === "true") {
      bookingWarn("slot-availability", "blocks query failed but BLOCK_CHECK_FAIL_OPEN=true — skipping block enforcement", {
        ...context,
        firestoreCode: (err as { code?: string }).code ?? null,
        message: err instanceof Error ? err.message.slice(0, 800) : String(err),
      });
      return { docs: [] };
    }
    bookingWarn("slot-availability", "blocks query failed; cannot verify admin blocks — returning 503 to callers", {
      ...context,
      firestoreCode: (err as { code?: string }).code ?? null,
      message: err instanceof Error ? err.message.slice(0, 800) : String(err),
      hint: "Deploy firestore.indexes.json (blocks composite) and wait until indexes are READY in Firebase Console.",
    });
    throw new BlockCheckUnavailableError();
  }
}

/** Returns true if any block overlaps the slot interval (experience + optional boat-specific queries). */
export async function hasAnyOverlappingBlockDoc(opts: {
  db: Firestore;
  Timestamp: TimestampConstructor;
  experienceId: string;
  experienceIdVariants?: string[];
  experienceSlug?: string;
  boatId?: string;
  slotStart: Date;
  slotEnd: Date;
  get?: (q: Query) => Promise<QuerySnapshot>;
}): Promise<boolean> {
  const { docs } = await fetchBlockDocsOverlappingSlot(opts);
  return docs.length > 0;
}

/** Fetch merged block docs overlapping [slotStart, slotEnd] for availability enforcement. */
export async function fetchBlockDocsOverlappingSlot(opts: {
  db: Firestore;
  Timestamp: TimestampConstructor;
  experienceId: string;
  experienceIdVariants?: string[];
  experienceSlug?: string;
  boatId?: string;
  slotStart: Date;
  slotEnd: Date;
  get?: (q: Query) => Promise<QuerySnapshot>;
}): Promise<BlockQueryResult> {
  const { db, Timestamp, experienceId, slotStart, slotEnd } = opts;
  const boatId = typeof opts.boatId === "string" && opts.boatId.trim() ? opts.boatId.trim() : null;
  const slotStartMs = slotStart.getTime();
  const slotEndMs = slotEnd.getTime();
  if (!Number.isFinite(slotStartMs) || !Number.isFinite(slotEndMs) || slotEndMs <= slotStartMs) {
    return { docs: [] };
  }

  const variantList = opts.experienceIdVariants?.length ? opts.experienceIdVariants : [];
  const expIds = Array.from(new Set([experienceId, ...variantList]));
  const experienceSlug =
    typeof opts.experienceSlug === "string" && opts.experienceSlug.trim() ? opts.experienceSlug.trim() : null;
  const getSnap = opts.get ?? ((q: Query) => q.get());

  const merged: QueryDocumentSnapshot[] = [];
  const seen = new Set<string>();

  for (const expIdForQuery of expIds) {
    const query = db
      .collection("blocks")
      .where("experienceId", "==", expIdForQuery)
      .where("startAt", "<=", Timestamp.fromDate(slotEnd))
      .where("endAt", ">=", Timestamp.fromDate(slotStart));
    const snap = await runIndexedBlockQuery(query, getSnap, { experienceId: expIdForQuery });
    mergeUniqueDocs(merged, seen, snap);
  }

  if (experienceSlug) {
    const slugQuery = db
      .collection("blocks")
      .where("experienceSlug", "==", experienceSlug)
      .where("startAt", "<=", Timestamp.fromDate(slotEnd))
      .where("endAt", ">=", Timestamp.fromDate(slotStart));
    const snap = await runIndexedBlockQuery(slugQuery, getSnap, { experienceSlug });
    mergeUniqueDocs(merged, seen, snap);
  }

  if (boatId) {
    const boatQuery = db
      .collection("blocks")
      .where("boatId", "==", boatId)
      .where("startAt", "<=", Timestamp.fromDate(slotEnd))
      .where("endAt", ">=", Timestamp.fromDate(slotStart));
    try {
      const snap = await getSnap(boatQuery);
      mergeUniqueDocs(merged, seen, snap);
    } catch (err) {
      if (!isIndexError(err)) throw err;
      try {
        const fallback = await db.collection("blocks").where("boatId", "==", boatId).get();
        for (const doc of fallback.docs) {
          const row = doc.data() as BlockRow;
          if (!blockRowOverlapsSlot(row, slotStartMs, slotEndMs, boatId)) continue;
          if (seen.has(doc.id)) continue;
          seen.add(doc.id);
          merged.push(doc);
        }
      } catch (fallbackErr) {
        if (process.env.BLOCK_CHECK_FAIL_OPEN === "true") {
          bookingWarn("slot-availability", "blocks boatId fallback failed but BLOCK_CHECK_FAIL_OPEN=true", {
            boatId,
            message: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
          });
        } else {
          throw new BlockCheckUnavailableError();
        }
      }
    }
  }

  const filtered = merged.filter((doc) =>
    blockRowOverlapsSlot(doc.data() as BlockRow, slotStartMs, slotEndMs, boatId),
  );
  return { docs: filtered };
}

/**
 * Calendar/slots API: block docs overlapping [windowStart, windowEnd] by experience ids and/or boat ids.
 */
export async function fetchBlockDocsOverlappingWindow(opts: {
  db: Firestore;
  Timestamp: TimestampConstructor;
  windowStart: Date;
  windowEnd: Date;
  experienceIds: string[];
  boatIds?: string[];
}): Promise<{ docs: import("firebase-admin/firestore").QueryDocumentSnapshot[]; incomplete: boolean }> {
  const { db, Timestamp, windowStart, windowEnd, experienceIds } = opts;
  const boatIds = (opts.boatIds ?? []).map((id) => id.trim()).filter(Boolean);
  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();
  const merged: QueryDocumentSnapshot[] = [];
  const seen = new Set<string>();

  const mergeFromSnap = (snap: BlockQueryResult) => {
    for (const doc of snap.docs) {
      const row = doc.data() as BlockRow;
      const bs = row.startAt?.toDate?.()?.getTime();
      const be = row.endAt?.toDate?.()?.getTime();
      if (bs == null || be == null) continue;
      if (!blockOverlapsWindowMs(bs, be, windowStartMs, windowEndMs)) continue;
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      merged.push(doc);
    }
  };

  try {
    const snaps = await Promise.all([
      ...experienceIds.map((expId) =>
        db
          .collection("blocks")
          .where("experienceId", "==", expId)
          .where("startAt", "<=", Timestamp.fromDate(windowEnd))
          .where("endAt", ">=", Timestamp.fromDate(windowStart))
          .get()
      ),
      ...experienceIds.map((expId) =>
        db
          .collection("blocks")
          .where("experienceSlug", "==", expId)
          .where("startAt", "<=", Timestamp.fromDate(windowEnd))
          .where("endAt", ">=", Timestamp.fromDate(windowStart))
          .get()
      ),
      ...boatIds.map((boatId) =>
        db
          .collection("blocks")
          .where("boatId", "==", boatId)
          .where("startAt", "<=", Timestamp.fromDate(windowEnd))
          .where("endAt", ">=", Timestamp.fromDate(windowStart))
          .get()
      ),
    ]);
    snaps.forEach(mergeFromSnap);
    return { docs: merged, incomplete: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/FAILED_PRECONDITION.*index/i.test(msg)) throw err;
    console.warn("[blocks-overlap-queries] composite query failed; using fallback queries:", msg);
    let anyFallbackFailed = false;
    for (const expId of experienceIds) {
      try {
        const snap = await db.collection("blocks").where("experienceId", "==", expId).get();
        mergeFromSnap(snap);
      } catch {
        anyFallbackFailed = true;
      }
    }
    for (const boatId of boatIds) {
      try {
        const snap = await db.collection("blocks").where("boatId", "==", boatId).get();
        mergeFromSnap(snap);
      } catch {
        anyFallbackFailed = true;
      }
    }
    if (anyFallbackFailed && merged.length === 0) {
      return { docs: [], incomplete: true };
    }
    return { docs: merged, incomplete: anyFallbackFailed };
  }
}
