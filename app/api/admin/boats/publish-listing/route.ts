import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";

function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
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
 * Sets isListingBoat: true and slug (from name) on every boat that's missing them,
 * so they appear on the public Our Boats page and /boats/[slug].
 */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const snap = await db.collection("boats").get();
    let updated = 0;
    const updatedBoats: Array<{ id: string; slug: string; name: string }> = [];
    for (const doc of snap.docs) {
      const data = doc.data() as { name?: string; isListingBoat?: boolean; slug?: string; photos?: unknown; experienceIds?: unknown };
      const name = typeof data.name === "string" ? data.name.trim() : "";
      if (!name) continue;
      const needsPublish = data.isListingBoat !== true || !data.slug || typeof data.slug !== "string";
      if (!needsPublish) continue;
      const baseSlug = slugFromName(name);
      if (!baseSlug) continue;
      const slug = await uniqueBoatSlug(db, baseSlug, doc.id);
      const updates: Record<string, unknown> = {
        isListingBoat: true,
        slug,
      };
      if (!Array.isArray(data.photos)) updates.photos = [];
      if (!Array.isArray(data.experienceIds)) updates.experienceIds = [];
      await doc.ref.update(updates);
      updated += 1;
      updatedBoats.push({ id: doc.id, slug, name });
    }
    return NextResponse.json({ ok: true, updated, total: snap.size, boats: updatedBoats });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
