import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import { normalizePublicSlug } from "@/lib/booking/slug";

function slugFromName(name: string): string {
  return normalizePublicSlug(name);
}

async function uniqueBoatSlug(db: ReturnType<typeof getDb>, candidate: string, currentBoatId: string): Promise<string> {
  let n = 1;
  let slug = candidate;
  while (true) {
    const snap = await db.collection("boats").where("slug", "==", slug).limit(1).get();
    if (snap.empty || snap.docs[0].id === currentBoatId) return slug;
    n += 1;
    slug = `${candidate}-${n}`;
  }
}

/**
 * POST /api/admin/boats/publish-listing
 * Requires explicit targets (or migrationMode=true) and supports dry-run previews.
 */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const body = (await request.json().catch(() => ({}))) as {
      boatIds?: unknown;
      migrationMode?: unknown;
      dryRun?: unknown;
    };
    const requestedIds = Array.isArray(body.boatIds)
      ? body.boatIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim())
      : [];
    const migrationMode = body.migrationMode === true;
    const dryRun = body.dryRun !== false;
    if (!migrationMode && requestedIds.length === 0) {
      return NextResponse.json(
        { error: "Provide explicit boatIds[], or set migrationMode=true for a one-off migration." },
        { status: 400 }
      );
    }
    const docs =
      migrationMode
        ? (await db.collection("boats").get()).docs
        : (
            await Promise.all(
              Array.from(new Set(requestedIds)).map((id) => db.collection("boats").doc(id).get())
            )
          ).filter((snap) => snap.exists) as import("firebase-admin/firestore").QueryDocumentSnapshot[];
    let updated = 0;
    const updatedBoats: Array<{ id: string; slug: string; name: string }> = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    for (const doc of docs) {
      const data = doc.data() as { name?: string; isListingBoat?: boolean; slug?: string; photos?: unknown; experienceIds?: unknown };
      const name = typeof data.name === "string" ? data.name.trim() : "";
      if (!name) {
        skipped.push({ id: doc.id, reason: "Missing boat name" });
        continue;
      }
      const needsPublish = data.isListingBoat !== true || !data.slug || typeof data.slug !== "string";
      if (!needsPublish) {
        skipped.push({ id: doc.id, reason: "Already published" });
        continue;
      }
      const baseSlug = slugFromName(name);
      if (!baseSlug) {
        skipped.push({ id: doc.id, reason: "Cannot derive slug from name" });
        continue;
      }
      const slug = await uniqueBoatSlug(db, baseSlug, doc.id);
      updatedBoats.push({ id: doc.id, slug, name });
    }
    const requiresPreview = updatedBoats.length > 1;
    // dryRun=true → preview only. dryRun=false (after UI confirm) always commits,
    // including multi-boat batches.
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        requiresExplicitCommit: requiresPreview,
        totalRequested: docs.length,
        willUpdate: updatedBoats.length,
        boats: updatedBoats,
        skipped,
      });
    }
    for (const boat of updatedBoats) {
      const targetDoc = docs.find((d) => d.id === boat.id);
      if (!targetDoc) continue;
      const existingData = targetDoc.data() as { photos?: unknown; experienceIds?: unknown };
      const updates: Record<string, unknown> = { isListingBoat: true, slug: boat.slug };
      if (!Array.isArray(existingData.photos)) updates.photos = [];
      if (!Array.isArray(existingData.experienceIds)) updates.experienceIds = [];
      await targetDoc.ref.update(updates);
      updated += 1;
    }
    return NextResponse.json({
      ok: true,
      dryRun: false,
      updated,
      totalRequested: docs.length,
      boats: updatedBoats,
      skipped,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
