import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import type { ListingBoat } from "@/lib/booking/types";
import { normalizePublicSlug } from "@/lib/booking/slug";
import {
  parseBoatType,
  parseAllowedStartTimes,
  sanitizePhotoUrls,
  validateBoatTypeAgainstExperiences,
} from "@/lib/boats/validation";

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
  const photos = sanitizePhotoUrls(b.photos).photos;
  const experienceIds = Array.isArray(b.experienceIds)
    ? b.experienceIds.filter((x): x is string => typeof x === "string")
    : [];
  const slugRaw = typeof b.slug === "string" ? b.slug : "";
  const slug = normalizePublicSlug(slugRaw);
  if (!slug) return null;
  const description = typeof b.description === "string" ? b.description.trim() || undefined : undefined;
  const active = typeof b.active === "boolean" ? b.active : true;
  // null/empty = omit boatType; invalid string rejects the body
  let boatType: string | undefined;
  if (b.boatType != null && b.boatType !== "") {
    const parsedBoatType = parseBoatType(b.boatType);
    if (parsedBoatType === null) return null;
    boatType = parsedBoatType ?? undefined;
  }
  const heroSubtitle = typeof b.heroSubtitle === "string" ? b.heroSubtitle.trim() || undefined : undefined;
  const capacity = typeof b.capacity === "number" && b.capacity > 0 ? b.capacity : undefined;
  const color = typeof b.color === "string" ? b.color.trim() || undefined : undefined;
  const allowedStartTimesParsed = parseAllowedStartTimes(b.allowedStartTimes);
  if (allowedStartTimesParsed === null) return null;
  const allowedStartTimes =
    allowedStartTimesParsed !== undefined && allowedStartTimesParsed.length > 0
      ? allowedStartTimesParsed
      : undefined;
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
    ...(allowedStartTimes && { allowedStartTimes }),
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
    return NextResponse.json(
      { error: "name and valid slug are required. boatType, when provided, must be pontoon|wake|tritoon." },
      { status: 400 }
    );
  }
  const { invalid: invalidPhotoUrls } =
    body && typeof body === "object" ? sanitizePhotoUrls((body as { photos?: unknown }).photos) : { invalid: [] };
  if (invalidPhotoUrls.length > 0) {
    return NextResponse.json(
      { error: "One or more photo URLs are invalid for this app.", invalidPhotoUrls },
      { status: 400 }
    );
  }

  try {
    const db = getDb();
    const idempotencyKey =
      body && typeof body === "object" && typeof (body as { createRequestKey?: unknown }).createRequestKey === "string"
        ? (body as { createRequestKey: string }).createRequestKey.trim()
        : "";
    const experienceIds = Array.isArray(parsed.experienceIds) ? parsed.experienceIds : [];
    if (experienceIds.length > 0) {
      const expRefs = experienceIds.map((expId) => db.collection("experiences").doc(expId));
      const expSnaps = await db.getAll(...expRefs);
      const experiences = expSnaps
        .filter((snap) => snap.exists)
        .map((snap) => ({ id: snap.id, ...(snap.data() as { slug?: string; title?: string; name?: string }) }));
      const incompatibility = validateBoatTypeAgainstExperiences(parsed.boatType, experiences);
      if (incompatibility) {
        return NextResponse.json({ error: incompatibility }, { status: 400 });
      }
    }
    const slugGuardRef = db.collection("boatUniqueGuards").doc(`slug:${parsed.slug}`);
    const reqGuardRef = idempotencyKey ? db.collection("boatUniqueGuards").doc(`req:${idempotencyKey}`) : null;
    const boatRef = db.collection("boats").doc();
    const doc = stripUndefined({
      ...parsed,
      isListingBoat: true,
      updatedAt: Date.now(),
      ...(idempotencyKey ? { createRequestKey: idempotencyKey } : {}),
    } as Record<string, unknown>);
    const txResult = await db.runTransaction(async (tx) => {
      if (reqGuardRef) {
        const reqGuardSnap = await tx.get(reqGuardRef);
        if (reqGuardSnap.exists) {
          const existingBoatId = (reqGuardSnap.data() as { boatId?: string }).boatId;
          if (existingBoatId) return { id: existingBoatId, reused: true };
        }
      }
      const slugGuardSnap = await tx.get(slugGuardRef);
      if (slugGuardSnap.exists) {
        const guardedBoatId = (slugGuardSnap.data() as { boatId?: string }).boatId;
        if (guardedBoatId) throw new Error("SLUG_CONFLICT");
      } else {
        const legacySlugMatch = await tx.get(
          db.collection("boats").where("isListingBoat", "==", true).where("slug", "==", parsed.slug).limit(1)
        );
        if (!legacySlugMatch.empty) throw new Error("SLUG_CONFLICT");
      }
      tx.set(boatRef, doc);
      tx.set(slugGuardRef, { keyType: "slug", slug: parsed.slug, boatId: boatRef.id, updatedAt: Date.now() });
      if (reqGuardRef) {
        tx.set(reqGuardRef, { keyType: "request", requestKey: idempotencyKey, boatId: boatRef.id, updatedAt: Date.now() });
      }
      return { id: boatRef.id, reused: false };
    });
    return NextResponse.json({ id: txResult.id });
  } catch (err) {
    if (err instanceof Error && err.message === "SLUG_CONFLICT") {
      return NextResponse.json({ error: "Slug already in use" }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
