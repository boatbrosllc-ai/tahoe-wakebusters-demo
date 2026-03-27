import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import { inferSlugFromTitle, getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { isCanonicalExperienceId } from "@/lib/booking/experience-id";

const PAGE_SIZE = 200;

type TargetCollection = "bookings" | "holds";

async function buildAliasToCanonicalMap() {
  const db = getDb();
  const expSnap = await db.collection("experiences").get();
  const map = new Map<string, string>();
  for (const doc of expSnap.docs) {
    const d = doc.data() as { slug?: string; title?: string; name?: string };
    const canonical = doc.id;
    map.set(canonical, canonical);
    const slug = typeof d.slug === "string" ? d.slug.trim() : "";
    const inferred = slug ? slug : inferSlugFromTitle(d.title ?? d.name);
    for (const v of getExperienceIdVariants(canonical, inferred)) {
      map.set(v.trim(), canonical);
    }
  }
  return map;
}

async function runBackfill(
  collectionId: TargetCollection,
  apply: boolean,
  cursor?: string | null
) {
  const db = getDb();
  const aliasMap = await buildAliasToCanonicalMap();
  let q = db.collection(collectionId).orderBy("createdAt", "asc").limit(PAGE_SIZE);
  if (cursor) {
    const cursorSnap = await db.collection(collectionId).doc(cursor).get();
    if (cursorSnap.exists) q = q.startAfter(cursorSnap);
  }
  const snap = await q.get();
  const last = snap.docs[snap.docs.length - 1];
  const updates: Array<{ id: string; from: string; to: string; outcome?: "updated" | "skipped" | "failed"; error?: string }> = [];
  for (const doc of snap.docs) {
    const row = doc.data() as { experienceId?: string };
    const raw = typeof row.experienceId === "string" ? row.experienceId.trim() : "";
    if (!raw || isCanonicalExperienceId(raw)) continue;
    const canonical = aliasMap.get(raw);
    if (canonical && canonical !== raw) {
      updates.push({ id: doc.id, from: raw, to: canonical });
    }
  }
  if (apply && updates.length > 0) {
    const distinctTargets = Array.from(new Set(updates.map((u) => u.to)));
    const targetChecks = await Promise.all(
      distinctTargets.map(async (id) => ({ id, exists: (await db.collection("experiences").doc(id).get()).exists }))
    );
    const missingTargets = targetChecks.filter((x) => !x.exists).map((x) => x.id);
    if (missingTargets.length > 0) {
      return {
        collection: collectionId,
        scanned: snap.size,
        updated: 0,
        candidates: updates.slice(0, 100),
        nextCursor: last?.id ?? null,
        pageSize: PAGE_SIZE,
        error: "Canonical experience targets missing",
        missingTargetExperienceIds: missingTargets,
      };
    }
    const batch = db.batch();
    for (const u of updates) {
      batch.update(db.collection(collectionId).doc(u.id), { experienceId: u.to });
      u.outcome = "updated";
    }
    try {
      await batch.commit();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      for (const u of updates) {
        u.outcome = "failed";
        u.error = message;
      }
    }
  } else {
    for (const u of updates) u.outcome = "skipped";
  }
  return {
    collection: collectionId,
    scanned: snap.size,
    updated: updates.filter((u) => u.outcome === "updated").length,
    candidates: updates.slice(0, 100),
    outcomes: updates.slice(0, 100).map((u) => ({
      id: u.id,
      from: u.from,
      to: u.to,
      outcome: u.outcome ?? "skipped",
      ...(u.error ? { error: u.error } : {}),
    })),
    nextCursor: last?.id ?? null,
    pageSize: PAGE_SIZE,
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  const collection = (request.nextUrl.searchParams.get("collection") as TargetCollection) || "bookings";
  const cursor = request.nextUrl.searchParams.get("cursor");
  if (collection !== "bookings" && collection !== "holds") {
    return NextResponse.json({ error: "collection must be 'bookings' or 'holds'" }, { status: 400 });
  }
  return NextResponse.json(await runBackfill(collection, false, cursor));
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  const body = (await request.json().catch(() => ({}))) as {
    collection?: TargetCollection;
    cursor?: string;
    applyUpdates?: boolean;
    verifyOnly?: boolean;
  };
  const verifyOnly = body.verifyOnly === true;
  const applyUpdates = body.applyUpdates === true && !verifyOnly;
  if (!applyUpdates && !verifyOnly) {
    return NextResponse.json({ error: "set verifyOnly=true to preview or applyUpdates=true to execute updates" }, { status: 400 });
  }
  const collection = body.collection ?? "bookings";
  if (collection !== "bookings" && collection !== "holds") {
    return NextResponse.json({ error: "collection must be 'bookings' or 'holds'" }, { status: 400 });
  }
  return NextResponse.json(await runBackfill(collection, applyUpdates, body.cursor ?? null));
}

