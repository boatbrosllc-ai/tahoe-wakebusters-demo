import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import type { ListingBoat } from "@/lib/booking/types";

function parseBody(body: unknown): (Omit<ListingBoat, "active"> & { active?: boolean }) | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return null;
  const photos = Array.isArray(b.photos) ? b.photos.filter((x): x is string => typeof x === "string") : [];
  const experienceIds = Array.isArray(b.experienceIds)
    ? b.experienceIds.filter((x): x is string => typeof x === "string")
    : [];
  const slug = typeof b.slug === "string" ? b.slug.trim() || undefined : undefined;
  const description = typeof b.description === "string" ? b.description.trim() || undefined : undefined;
  const active = typeof b.active === "boolean" ? b.active : true;
  const boatType = typeof b.boatType === "string" ? b.boatType.trim() || undefined : undefined;
  return {
    name,
    slug,
    description,
    photos,
    active,
    experienceIds,
    isListingBoat: true as const,
    ...(boatType && { boatType }),
  };
}

/** GET /api/admin/boats — list all listing boats */
export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const snap = await db.collection("boats").where("isListingBoat", "==", true).get();
    const list = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    return NextResponse.json({ boats: list });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}

/** POST /api/admin/boats — create a listing boat */
export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseBody(body);
  if (!parsed) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  try {
    const db = getDb();
    const boatRef = db.collection("boats").doc();
    await boatRef.set({
      ...parsed,
      isListingBoat: true,
    });
    return NextResponse.json({ id: boatRef.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
