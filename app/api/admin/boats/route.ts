import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import type { ListingBoat } from "@/lib/booking/types";

/** Remove undefined values so Firestore accepts the document (ignoreUndefinedProperties is off). */
function stripUndefined<T extends Record<string, unknown>>(obj: T): { [K in keyof T]: T[K] } {
  const out = {} as { [K in keyof T]: T[K] };
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) (out as Record<string, unknown>)[key as string] = obj[key];
  }
  return out;
}

function parseBody(body: unknown): (Omit<ListingBoat, "active"> & { active?: boolean }) | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return null;
  const photos = Array.isArray(b.photos) ? b.photos.filter((x): x is string => typeof x === "string") : [];
  const experienceIds = Array.isArray(b.experienceIds)
    ? b.experienceIds.filter((x): x is string => typeof x === "string")
    : [];
  const slugRaw = typeof b.slug === "string" ? b.slug.trim() : "";
  const slug = slugRaw ? slugRaw.toLowerCase().replace(/\s+/g, "-") : undefined;
  const description = typeof b.description === "string" ? b.description.trim() || undefined : undefined;
  const active = typeof b.active === "boolean" ? b.active : true;
  const boatType = typeof b.boatType === "string" ? b.boatType.trim() || undefined : undefined;
  const heroSubtitle = typeof b.heroSubtitle === "string" ? b.heroSubtitle.trim() || undefined : undefined;
  const capacity = typeof b.capacity === "number" && b.capacity > 0 ? b.capacity : undefined;
  const color = typeof b.color === "string" ? b.color.trim() || undefined : undefined;
  const parsed = {
    name,
    slug,
    description,
    photos,
    active,
    experienceIds,
    isListingBoat: true as const,
    ...(boatType && { boatType }),
    ...(heroSubtitle && { heroSubtitle }),
    ...(capacity !== undefined && { capacity }),
    ...(color && { color }),
  };
  return stripUndefined(parsed as Record<string, unknown>) as (Omit<ListingBoat, "active"> & { active?: boolean });
}

/** GET /api/admin/boats — list all boats (including those not yet on public Our Boats page) */
export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const db = getDb();
    const snap = await db.collection("boats").get();
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
    const doc = stripUndefined({ ...parsed, isListingBoat: true } as Record<string, unknown>);
    await boatRef.set(doc);
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
