/**
 * Backfill missing startDateStr on bookings (and optionally holds).
 * Run until remaining count is zero, then set DISABLE_LEGACY_BOOKING_FALLBACK=true in production.
 *
 * **Deployment gate:** Before indexed paid-booking counts for any experience variant approach ~80% of
 * `LEGACY_BOOKING_SCAN_LIMIT` (default 2000 → 1600 rows), complete this backfill so legacy scans do not hit the cap
 * and surface as degraded availability (503) for customers.
 *
 * GET: Dry-run report of how many docs are missing startDateStr.
 * POST with body { applyUpdates: true, collection?: "bookings" | "holds" }: paginate through docs
 * missing startDateStr, set startDateStr from slotId (parseSlotId), then re-run until zero.
 *
 * Requires admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";

const PAGE_SIZE = 200;

type CollectionId = "bookings" | "holds";

/** Firestore has no "field not set" query; we fetch a page and filter client-side, then optionally write. Use cursor for pagination. */
async function runBackfill(
  dryRun: boolean,
  collectionId: CollectionId,
  request?: NextRequest,
  cursorDocId?: string | null,
  options?: { runUntilDone?: boolean; maxPages?: number }
) {
  const db = getDb();

  const col = db.collection(collectionId);
  let query =
    collectionId === "bookings"
      ? col.where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN)).orderBy("createdAt", "asc").limit(PAGE_SIZE)
      : col.where("status", "==", "active").orderBy("createdAt", "asc").limit(PAGE_SIZE);

  if (cursorDocId) {
    const cursorSnap = await col.doc(cursorDocId).get();
    if (cursorSnap.exists) query = query.startAfter(cursorSnap);
  }

  const snap = await query.get();
  const missing: { id: string; slotId?: string; startDateStr?: string }[] = [];

  for (const doc of snap.docs) {
    const d = doc.data() as { slotId?: string; slot_id?: string; startDateStr?: string };
    const startDateStr = typeof d.startDateStr === "string" ? d.startDateStr.trim() : undefined;
    if (startDateStr && /^\d{4}-\d{2}-\d{2}$/.test(startDateStr)) continue;
    const slotId = d.slotId ?? d.slot_id;
    if (typeof slotId !== "string" || !slotId.trim()) continue;
    const parsed = parseSlotId(slotId.trim());
    const inferred = parsed?.dateStr ?? (slotId.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(slotId) ? slotId.slice(0, 10) : undefined);
    if (!inferred) continue;
    missing.push({ id: doc.id, slotId: slotId.trim(), startDateStr: inferred });
  }

  const updatedIds: string[] = [];
  if (!dryRun && missing.length > 0) {
    const batch = db.batch();
    for (const { id, startDateStr } of missing) {
      if (startDateStr) batch.update(col.doc(id), { startDateStr });
    }
    await batch.commit();
    missing.forEach((m) => updatedIds.push(m.id));
  }

  if (!dryRun && updatedIds.length > 0 && request) {
    console.log("[backfill-start-date-str] operator action", {
      action: "backfill_start_date_str",
      collection: collectionId,
      updatedCount: updatedIds.length,
      docIds: updatedIds.slice(0, 20),
      at: new Date().toISOString(),
    });
  }

  const lastDoc = snap.docs[snap.docs.length - 1];
  const nextCursor = lastDoc?.id ?? null;

  if (!dryRun && options?.runUntilDone === true) {
    let totalScanned = snap.size;
    let totalUpdated = updatedIds.length;
    let totalMissing = missing.length;
    let next: string | null = nextCursor;
    let pages = 1;
    const maxPages = Math.max(1, options.maxPages ?? 50);
    while (next && pages < maxPages) {
      pages++;
      let q =
        collectionId === "bookings"
          ? col.where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN)).orderBy("createdAt", "asc").limit(PAGE_SIZE)
          : col.where("status", "==", "active").orderBy("createdAt", "asc").limit(PAGE_SIZE);
      const cSnap = await col.doc(next).get();
      if (cSnap.exists) q = q.startAfter(cSnap);
      const p = await q.get();
      totalScanned += p.size;
      const pageMissing: { id: string; slotId?: string; startDateStr?: string }[] = [];
      for (const doc of p.docs) {
        const d = doc.data() as { slotId?: string; slot_id?: string; startDateStr?: string };
        const startDateStr = typeof d.startDateStr === "string" ? d.startDateStr.trim() : undefined;
        if (startDateStr && /^\d{4}-\d{2}-\d{2}$/.test(startDateStr)) continue;
        const slotId = d.slotId ?? d.slot_id;
        if (typeof slotId !== "string" || !slotId.trim()) continue;
        const parsed = parseSlotId(slotId.trim());
        const inferred = parsed?.dateStr ?? (slotId.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(slotId) ? slotId.slice(0, 10) : undefined);
        if (!inferred) continue;
        pageMissing.push({ id: doc.id, slotId: slotId.trim(), startDateStr: inferred });
      }
      totalMissing += pageMissing.length;
      if (pageMissing.length > 0) {
        const b = db.batch();
        for (const m of pageMissing) {
          if (m.startDateStr) b.update(col.doc(m.id), { startDateStr: m.startDateStr });
        }
        await b.commit();
        totalUpdated += pageMissing.length;
      }
      if (p.size < PAGE_SIZE) {
        next = null;
      } else {
        next = p.docs[p.docs.length - 1]?.id ?? null;
      }
    }
    return NextResponse.json({
      dryRun,
      collection: collectionId,
      pageSize: PAGE_SIZE,
      scanned: totalScanned,
      missingCount: totalMissing,
      updatedCount: totalUpdated,
      nextCursor: next,
      runUntilDone: true,
      pagesProcessed: pages,
      fullyCompleted: next == null,
      hint:
        next == null
          ? "Backfill pass completed to end of collection."
          : "Stopped at maxPages; rerun with runUntilDone=true to continue.",
    });
  }

  return NextResponse.json({
    dryRun,
    collection: collectionId,
    pageSize: PAGE_SIZE,
    scanned: snap.size,
    missingCount: missing.length,
    updatedCount: updatedIds.length,
    nextCursor,
    results: missing.slice(0, 50).map((m) => ({ id: m.id, slotId: m.slotId, startDateStr: m.startDateStr })),
    hint:
      missing.length === 0 && !nextCursor
        ? "No docs in this collection (or no more pages)."
        : missing.length === 0
          ? "No docs missing startDateStr in this page. Re-run with cursor nextCursor to continue; when all pages show missingCount 0, set DISABLE_LEGACY_BOOKING_FALLBACK=true (and DISABLE_LEGACY_HOLDS_FALLBACK=true for holds)."
          : dryRun
            ? "To apply updates, use POST with body { applyUpdates: true, collection: \"bookings\" } (or \"holds\"). Optionally pass cursor for pagination."
            : "Re-run POST with nextCursor until missingCount is zero across all pages.",
  });
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  const collection = (request.nextUrl.searchParams.get("collection") as CollectionId) || "bookings";
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  if (collection !== "bookings" && collection !== "holds") {
    return NextResponse.json({ error: "collection must be 'bookings' or 'holds'" }, { status: 400 });
  }
  return runBackfill(true, collection, undefined, cursor || null);
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  const body = await request.json().catch(() => ({})) as {
    applyUpdates?: boolean;
    collection?: string;
    cursor?: string;
    runUntilDone?: boolean;
    maxPages?: number;
  };
  const applyUpdates = body.applyUpdates === true;
  const collection = (body.collection === "holds" ? "holds" : "bookings") as CollectionId;
  const cursor = body.cursor ?? null;
  if (!applyUpdates) {
    return NextResponse.json(
      { error: "Actual updates require POST with body { applyUpdates: true, collection?: \"bookings\" | \"holds\", cursor?: string }. Use GET for dry-run." },
      { status: 400 }
    );
  }
  return runBackfill(false, collection, request, cursor, {
    runUntilDone: body.runUntilDone === true,
    maxPages: body.maxPages,
  });
}
