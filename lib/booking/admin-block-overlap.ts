/**
 * Detect overlapping admin block documents (same experience family + boat scope).
 * Used by POST/PATCH /api/admin/blocks so operators do not stack duplicate blocks.
 */

import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";

function isMissingIndexError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /FAILED_PRECONDITION.*index/i.test(msg);
}

/** Half-open style: touching at an endpoint (a1 === b0 or b1 === a0) is not an overlap. */
export function adminBlockIntervalsOverlap(a0: Date, a1: Date, b0: Date, b1: Date): boolean {
  return a0.getTime() < b1.getTime() && b0.getTime() < a1.getTime();
}

/** True when two blocks affect the same boat row (null = all boats). */
export function adminBlockBoatScopesCollide(boatA: string | null, boatB: string | null): boolean {
  if (boatA == null || boatB == null) return true;
  return boatA === boatB;
}

type BlockRow = {
  experienceId?: string;
  experienceSlug?: string | null;
  slugVariants?: unknown;
  boatId?: string | null;
  startAt?: { toDate?: () => Date };
  endAt?: { toDate?: () => Date };
};

export function blockRowMatchesExperienceVariants(row: BlockRow, variantSet: Set<string>): boolean {
  const expId = typeof row.experienceId === "string" ? row.experienceId : "";
  if (expId && variantSet.has(expId)) return true;
  const slug = typeof row.experienceSlug === "string" ? row.experienceSlug.trim() : "";
  if (slug && variantSet.has(slug)) return true;
  const sv = row.slugVariants;
  if (Array.isArray(sv)) {
    for (const v of sv) {
      if (typeof v === "string" && variantSet.has(v)) return true;
    }
  }
  return false;
}

export type AdminBlockOverlapHit = { id: string; startAt: string; endAt: string; boatId: string | null };

/**
 * Returns admin block docs whose interval overlaps [intervalStart, intervalEnd] for the same
 * experience variants and boat scope as the proposed block.
 */
export async function findOverlappingAdminBlocksForWrite(params: {
  db: Firestore;
  Timestamp: typeof import("firebase-admin/firestore").Timestamp;
  experienceId: string;
  experienceSlug: string;
  variantIds: string[];
  intervalStart: Date;
  intervalEnd: Date;
  boatId: string | null;
  excludeBlockId?: string;
}): Promise<AdminBlockOverlapHit[]> {
  const {
    db,
    Timestamp,
    experienceId,
    experienceSlug,
    variantIds,
    intervalStart,
    intervalEnd,
    boatId,
    excludeBlockId,
  } = params;
  const variantSet = new Set(variantIds);

  /** Any overlapping block must have startAt <= intervalEnd; filter endAt >= intervalStart in memory. */
  const fetchByExpId = async () => {
    try {
      return await db
        .collection("blocks")
        .where("experienceId", "==", experienceId)
        .where("startAt", "<=", Timestamp.fromDate(intervalEnd))
        .get();
    } catch (err) {
      if (!isMissingIndexError(err)) throw err;
      return await db.collection("blocks").where("experienceId", "==", experienceId).get();
    }
  };
  const fetchBySlug = async () => {
    if (!experienceSlug) {
      return { docs: [] } as { docs: QueryDocumentSnapshot[] };
    }
    try {
      return await db
        .collection("blocks")
        .where("experienceSlug", "==", experienceSlug)
        .where("startAt", "<=", Timestamp.fromDate(intervalEnd))
        .get();
    } catch (err) {
      if (!isMissingIndexError(err)) throw err;
      return await db.collection("blocks").where("experienceSlug", "==", experienceSlug).get();
    }
  };

  const [snapId, snapSlug] = await Promise.all([fetchByExpId(), fetchBySlug()]);
  const merged: QueryDocumentSnapshot[] = [];
  const seen = new Set<string>();
  for (const snap of [snapId, snapSlug]) {
    for (const doc of snap.docs) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      merged.push(doc);
    }
  }

  const hits: AdminBlockOverlapHit[] = [];
  for (const doc of merged) {
    if (excludeBlockId && doc.id === excludeBlockId) continue;
    const row = doc.data() as BlockRow;
    if (!blockRowMatchesExperienceVariants(row, variantSet)) continue;
    const s = row.startAt?.toDate?.();
    const e = row.endAt?.toDate?.();
    if (!s || !e) continue;
    if (e.getTime() < intervalStart.getTime()) continue;
    if (s.getTime() > intervalEnd.getTime()) continue;
    if (!adminBlockIntervalsOverlap(intervalStart, intervalEnd, s, e)) continue;
    const rowBoat = typeof row.boatId === "string" ? row.boatId.trim() || null : null;
    if (!adminBlockBoatScopesCollide(boatId, rowBoat)) continue;
    hits.push({
      id: doc.id,
      startAt: s.toISOString(),
      endAt: e.toISOString(),
      boatId: rowBoat,
    });
  }
  return hits;
}
