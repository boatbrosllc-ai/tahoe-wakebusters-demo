import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import type { ListingBoat, BoatRate } from "@/lib/booking/types";

function parseBody(body: unknown): Partial<ListingBoat> & { rates?: Omit<BoatRate, "active">[] } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const out: ReturnType<typeof parseBody> = {};
  if (typeof b.name === "string") out.name = b.name.trim();
  if (typeof b.slug === "string") out.slug = b.slug.trim() || undefined;
  if (typeof b.description === "string") out.description = b.description.trim() || undefined;
  if (Array.isArray(b.photos)) out.photos = b.photos.filter((x): x is string => typeof x === "string");
  if (typeof b.active === "boolean") out.active = b.active;
  if (Array.isArray(b.experienceIds)) out.experienceIds = b.experienceIds.filter((x): x is string => typeof x === "string");
  if (Array.isArray(b.rates)) {
    out.rates = b.rates
      .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
      .map((x) => ({
        durationHours: typeof x.durationHours === "number" ? x.durationHours : 0,
        displayName: typeof x.displayName === "string" ? x.displayName : "",
        priceCents: typeof x.priceCents === "number" ? x.priceCents : 0,
      }));
  }
  return Object.keys(out).length ? out : null;
}

/** GET /api/admin/boats/[id] — get one listing boat with rates */
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
    const ratesSnap = await db.collection("boats").doc(id).collection("rates").get();
    const rates = ratesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ id: boatSnap.id, ...data, rates });
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

  const { rates, ...boatFields } = parsed;

  try {
    const db = getDb();
    const boatRef = db.collection("boats").doc(id);
    const boatSnap = await boatRef.get();
    if (!boatSnap.exists || (boatSnap.data() as { isListingBoat?: boolean })?.isListingBoat !== true) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (Object.keys(boatFields).length > 0) {
      await boatRef.update(boatFields as Partial<ListingBoat>);
    }
    if (Array.isArray(rates)) {
      const ratesRef = boatRef.collection("rates");
      const existing = await ratesRef.get();
      for (const d of existing.docs) await d.ref.delete();
      for (const r of rates) {
        await ratesRef.doc().set({ ...r, active: true } as BoatRate);
      }
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
