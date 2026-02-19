import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import type { ListingBoat } from "@/lib/booking/types";

/** Remove undefined values so Firestore accepts the update (ignoreUndefinedProperties is off). */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

function parseBody(body: unknown): Partial<ListingBoat> | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const out: ReturnType<typeof parseBody> = {};
  if (typeof b.name === "string") out.name = b.name.trim();
  if (typeof b.slug === "string") {
    const s = b.slug.trim();
    out.slug = s ? s.toLowerCase().replace(/\s+/g, "-") : undefined;
  }
  if (typeof b.description === "string") out.description = b.description.trim() || undefined;
  if (Array.isArray(b.photos)) out.photos = b.photos.filter((x): x is string => typeof x === "string");
  if (typeof b.active === "boolean") out.active = b.active;
  if (typeof b.boatType === "string") out.boatType = b.boatType.trim() || undefined;
  if (Array.isArray(b.experienceIds)) out.experienceIds = b.experienceIds.filter((x): x is string => typeof x === "string");
  const filtered = stripUndefined(out as Record<string, unknown>);
  return Object.keys(filtered).length ? (filtered as Partial<ListingBoat>) : null;
}

/** GET /api/admin/boats/[id] — get one listing boat */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const db = getDb();
    const boatSnap = await db.collection("boats").doc(id).get();
    if (!boatSnap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const data = boatSnap.data();
    if ((data as { isListingBoat?: boolean })?.isListingBoat !== true) {
      return NextResponse.json({ error: "Not a listing boat" }, { status: 404 });
    }
    return NextResponse.json({ id: boatSnap.id, ...data });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}

/** PATCH /api/admin/boats/[id] — update listing boat */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseBody(body);
  if (!parsed) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const db = getDb();
    const boatRef = db.collection("boats").doc(id);
    const boatSnap = await boatRef.get();
    if (!boatSnap.exists || (boatSnap.data() as { isListingBoat?: boolean })?.isListingBoat !== true) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (Object.keys(parsed).length > 0) {
      const updateData = stripUndefined(parsed as Record<string, unknown>);
      await boatRef.update(updateData);
    }
    return NextResponse.json({ id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}

/** DELETE /api/admin/boats/[id] — delete a listing boat (and its subcollections: rates, slots, addons) */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const db = getDb();
    const boatRef = db.collection("boats").doc(id);
    const boatSnap = await boatRef.get();
    if (!boatSnap.exists || (boatSnap.data() as { isListingBoat?: boolean })?.isListingBoat !== true) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const subcollections = ["rates", "slots", "addons"];
    for (const sub of subcollections) {
      const snap = await boatRef.collection(sub).get();
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      if (!snap.empty) await batch.commit();
    }
    await boatRef.delete();
    return NextResponse.json({ id, deleted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
