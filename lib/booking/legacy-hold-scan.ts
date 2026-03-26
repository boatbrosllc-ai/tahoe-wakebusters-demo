/**
 * Shared legacy holds scan (holds missing `startDateStr`) for availability routes.
 * Prefer `DISABLE_LEGACY_HOLDS_FALLBACK=true` after backfilling `startDateStr` on all holds.
 */

import { FieldPath, Timestamp } from "firebase-admin/firestore";
import type { DocumentSnapshot, Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";

export const DEFAULT_LEGACY_HOLDS_PAGE_SIZE = 100;

/** Same message as ticket-availability when legacy hold counts may be incomplete. */
export const LEGACY_HOLDS_CONSERVATIVE_AVAILABILITY_NOTE =
  "Availability may be limited — your selection will be confirmed at checkout";

/**
 * Slots route: legacy holds merge using `expiresAt` lower bound + limit (not full cursor scan).
 */
export async function scanLegacyHoldsExpiresAtLowerBound(
  db: Firestore,
  expId: string,
  lowerBound: Timestamp,
  limit: number,
): Promise<{ docs: QueryDocumentSnapshot[]; partial: boolean }> {
  const snap = await db
    .collection("holds")
    .where("experienceId", "==", expId)
    .where("status", "==", "active")
    .where("expiresAt", ">=", lowerBound)
    .limit(limit)
    .get();
  return { docs: snap.docs, partial: snap.size >= limit };
}

export type LegacyHoldScanResult = {
  docs: QueryDocumentSnapshot[];
  /** True when `budgetMs` was exceeded before finishing pagination (caller may treat as incomplete scan). */
  timedOut: boolean;
  /** True when `maxPages` stopped pagination early (truncated scan). */
  partial: boolean;
};

/**
 * Cursor-pagination over active holds for one experience (legacy: no `startDateStr` index path).
 * Optionally stops after `budgetMs` (returns accumulated docs so far with `timedOut` or empty — see `emptyDocsOnTimeout`)
 * or after `maxPages` (`partial`).
 */
export async function scanLegacyActiveHoldsForExperience(
  db: Firestore,
  expId: string,
  options: {
    pageSize?: number;
    /** Stop paging after this wall-clock budget; used by date-prices. */
    budgetMs?: number;
    /** Max index pages; used by ticket-availability. */
    maxPages?: number;
    /**
     * When true (date-prices), a timeout yields `docs: []` and `timedOut: true`.
     * When false, timeout yields whatever was read before the budget (conservative partial).
     */
    emptyDocsOnTimeout?: boolean;
  } = {},
): Promise<LegacyHoldScanResult> {
  const pageSize = options.pageSize ?? DEFAULT_LEGACY_HOLDS_PAGE_SIZE;
  const budgetMs = options.budgetMs;
  const maxPages = options.maxPages;
  const emptyOnTimeout = options.emptyDocsOnTimeout === true;

  const allDocs: QueryDocumentSnapshot[] = [];
  let lastDoc: DocumentSnapshot | null = null;
  let pageCount = 0;
  const startMs = Date.now();

  const overBudget = () => budgetMs != null && Date.now() - startMs >= budgetMs;

  for (;;) {
    if (overBudget()) {
      return {
        docs: emptyOnTimeout ? [] : allDocs,
        timedOut: true,
        partial: emptyOnTimeout ? false : allDocs.length > 0,
      };
    }
    if (maxPages != null && pageCount >= maxPages) {
      return { docs: allDocs, timedOut: false, partial: true };
    }
    pageCount++;

    let query = db
      .collection("holds")
      .where("experienceId", "==", expId)
      .where("status", "==", "active")
      .orderBy(FieldPath.documentId())
      .limit(pageSize);
    if (lastDoc) query = query.startAfter(lastDoc) as typeof query;

    const snap = await query.get();
    allDocs.push(...snap.docs);
    if (snap.empty || snap.docs.length < pageSize) {
      return { docs: allDocs, timedOut: false, partial: false };
    }
    lastDoc = snap.docs[snap.docs.length - 1];
  }
}

/**
 * Merge legacy hold docs into `holdDocMap` by id; skip docs that already have `startDateStr` on the legacy doc
 * (already window-indexed). Backfill writes are intentionally NOT performed in hot request paths.
 */
export function mergeLegacyHoldDocsWithOptionalBackfill(
  holdDocMap: Map<string, QueryDocumentSnapshot>,
  legacyDocs: QueryDocumentSnapshot[],
): void {
  for (const doc of legacyDocs) {
    if (holdDocMap.has(doc.id)) continue;
    const legacyData = doc.data() as { startDateStr?: string; slotId?: string };
    if (legacyData.startDateStr) continue;
    holdDocMap.set(doc.id, doc);
  }
}
