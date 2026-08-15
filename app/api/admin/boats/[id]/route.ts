import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { collectAllActiveHoldDocsForBoat } from "@/lib/booking/admin-active-holds-query";
import { BOOKING_STATUSES_SLOT_TAKEN, type ListingBoat } from "@/lib/booking/types";
import { runExpiredHoldReleaseTransaction } from "@/lib/booking/cleanup-holds-logic";
import { normalizePublicSlug } from "@/lib/booking/slug";
import {
  parseBoatType,
  parseAllowedStartTimes,
  sanitizePhotoUrls,
  validateBoatTypeAgainstExperiences,
} from "@/lib/boats/validation";

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
  const out: Record<string, unknown> = {};
  if (typeof b.name === "string") out.name = b.name.trim();
  if (typeof b.slug === "string") {
    const normalized = normalizePublicSlug(b.slug);
    out.slug = normalized || undefined;
  }
  if (typeof b.description === "string") out.description = b.description.trim();
  if (Array.isArray(b.photos)) out.photos = sanitizePhotoUrls(b.photos).photos;
  if (typeof b.active === "boolean") out.active = b.active;
  if (Object.prototype.hasOwnProperty.call(b, "boatType")) {
    // null clears boatType; invalid strings reject the whole body.
    if (b.boatType === null) {
      out.boatType = null;
    } else {
      const parsedBoatType = parseBoatType(b.boatType);
      if (parsedBoatType === null) return null;
      out.boatType = parsedBoatType ?? undefined;
    }
  }
  if (Array.isArray(b.experienceIds)) out.experienceIds = b.experienceIds.filter((x): x is string => typeof x === "string");
  if (typeof b.heroSubtitle === "string") out.heroSubtitle = b.heroSubtitle.trim();
  if (b.capacity === null) out.capacity = null;
  else if (typeof b.capacity === "number" && b.capacity > 0) out.capacity = b.capacity;
  if (typeof b.color === "string") out.color = b.color.trim() || undefined;
  else if (b.color === null) out.color = null;
  if (Object.prototype.hasOwnProperty.call(b, "allowedStartTimes")) {
    const allowed = parseAllowedStartTimes(b.allowedStartTimes);
    if (allowed === null) return null;
    // Empty / null → clear on update (FieldValue.delete applied in PATCH handler)
    out.allowedStartTimes = allowed ?? [];
  }
  const filtered = stripUndefined(out);
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
    return NextResponse.json({ id: boatSnap.id, ...data, updatedAt: (data as { updatedAt?: unknown }).updatedAt ?? null });
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
  const force = body != null && typeof body === "object" && (body as { force?: unknown }).force === true;
  const slugProvided =
    body != null &&
    typeof body === "object" &&
    Object.prototype.hasOwnProperty.call(body as Record<string, unknown>, "slug");
  const hasLastKnownUpdatedAt =
    body != null &&
    typeof body === "object" &&
    Object.prototype.hasOwnProperty.call(body as Record<string, unknown>, "lastKnownUpdatedAt");
  const lastKnownUpdatedAtRaw =
    body != null && typeof body === "object"
      ? (body as { lastKnownUpdatedAt?: unknown }).lastKnownUpdatedAt
      : undefined;
  const lastKnownUpdatedAt =
    typeof lastKnownUpdatedAtRaw === "number"
      ? lastKnownUpdatedAtRaw
      : typeof lastKnownUpdatedAtRaw === "string" && lastKnownUpdatedAtRaw.trim()
        ? Number(lastKnownUpdatedAtRaw)
        : null;
  if (!parsed) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }
  if (slugProvided && typeof parsed.slug !== "string") {
    return NextResponse.json({ error: "Slug must contain letters or numbers." }, { status: 400 });
  }
  if (body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body as Record<string, unknown>, "photos")) {
    const { invalid } = sanitizePhotoUrls((body as { photos?: unknown }).photos);
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: "One or more photo URLs are invalid for this app.", invalidPhotoUrls: invalid },
        { status: 400 }
      );
    }
  }

  try {
    const db = getDb();
    const { FieldValue } = getFirestoreExports();
    if (!hasLastKnownUpdatedAt) {
      return NextResponse.json({ error: "Missing lastKnownUpdatedAt revision token." }, { status: 400 });
    }
    if (lastKnownUpdatedAt !== null && !Number.isFinite(lastKnownUpdatedAt)) {
      return NextResponse.json({ error: "Invalid lastKnownUpdatedAt revision token." }, { status: 400 });
    }
    const boatRef = db.collection("boats").doc(id);
    const existingBoatSnap = await boatRef.get();
    if (!existingBoatSnap.exists || (existingBoatSnap.data() as { isListingBoat?: boolean })?.isListingBoat !== true) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const existingBoatData = existingBoatSnap.data() as ListingBoat;
    const boatTypeCleared =
      Object.prototype.hasOwnProperty.call(parsed, "boatType") && (parsed as { boatType?: unknown }).boatType == null;
    const effectiveBoatType =
      typeof parsed.boatType === "string"
        ? parsed.boatType
        : boatTypeCleared
          ? undefined
          : typeof existingBoatData.boatType === "string"
            ? existingBoatData.boatType
            : undefined;
    const nextExperienceIds = Array.isArray(parsed.experienceIds)
      ? parsed.experienceIds
      : Array.isArray(existingBoatData.experienceIds)
        ? existingBoatData.experienceIds
        : [];
    if (nextExperienceIds.length > 0) {
      const expRefs = nextExperienceIds.map((expId) => db.collection("experiences").doc(expId));
      const expSnaps = await db.getAll(...expRefs);
      const experiences = expSnaps
        .filter((snap) => snap.exists)
        .map((snap) => ({ id: snap.id, ...(snap.data() as { slug?: string; title?: string; name?: string }) }));
      const incompatibility = validateBoatTypeAgainstExperiences(effectiveBoatType, experiences);
      if (incompatibility) {
        return NextResponse.json({ error: incompatibility }, { status: 400 });
      }
    }
    const boatData = existingBoatData as ListingBoat & { previousSlugs?: string[] };
    const currentSlug = typeof boatData.slug === "string" ? boatData.slug.trim().toLowerCase() : "";
    const nextSlug = typeof parsed.slug === "string" ? parsed.slug.trim().toLowerCase() : currentSlug;
    let slugChangeWarning: string | null = null;
    if (nextSlug && currentSlug && nextSlug !== currentSlug) {
      const previousSlugs = Array.isArray(boatData.previousSlugs)
        ? boatData.previousSlugs.filter((s): s is string => typeof s === "string")
        : [];
      const merged = Array.from(new Set([...previousSlugs, currentSlug]));
      (parsed as Record<string, unknown>).previousSlugs = merged;
      slugChangeWarning =
        "Boat slug changed. External links to the old /boats/[slug] URL may break unless clients are redirected.";
    }
    const isDeactivatingBoat = parsed.active === false && boatData.active === true;
    let holdReleaseSummary:
      | {
          attempted: number;
          processed: string[];
          skipped: string[];
          failed: Array<{ holdId: string; error?: string }>;
          partialFailure: boolean;
        }
      | null = null;
    if (isDeactivatingBoat) {
      const activeHoldDocs = await collectAllActiveHoldDocsForBoat(db, id);
      if (!force && activeHoldDocs.length > 0) {
        return NextResponse.json(
          {
            error:
              "Deactivating this boat would release active customer holds. Re-submit with { force: true } to confirm hold release.",
            activeHoldCount: activeHoldDocs.length,
            holdIds: activeHoldDocs.map((d) => d.id),
            forceRequired: true,
          },
          { status: 409 }
        );
      }
      if (force && activeHoldDocs.length > 0) {
        const processed: string[] = [];
        const skipped: string[] = [];
        const failed: Array<{ holdId: string; error?: string }> = [];
        for (const holdDoc of activeHoldDocs) {
          try {
            const releaseResult = await runExpiredHoldReleaseTransaction(db, FieldValue, holdDoc.ref);
            if (releaseResult === "processed") processed.push(holdDoc.id);
            else if (releaseResult === "skipped") skipped.push(holdDoc.id);
            else failed.push({ holdId: holdDoc.id });
          } catch (releaseErr) {
            failed.push({
              holdId: holdDoc.id,
              error: releaseErr instanceof Error ? releaseErr.message : String(releaseErr),
            });
          }
        }
        holdReleaseSummary = {
          attempted: activeHoldDocs.length,
          processed,
          skipped,
          failed,
          partialFailure: failed.length > 0,
        };
        console.log("[admin/boats/:id] deactivate release holds", {
          boatId: id,
          ...holdReleaseSummary,
        });
      }
    }
    if (Object.keys(parsed).length > 0) {
      const updateData = stripUndefined({ ...(parsed as Record<string, unknown>), updatedAt: Date.now() });
      if (
        Object.prototype.hasOwnProperty.call(updateData, "allowedStartTimes") &&
        (!Array.isArray(updateData.allowedStartTimes) ||
          (updateData.allowedStartTimes as unknown[]).length === 0)
      ) {
        updateData.allowedStartTimes = FieldValue.delete();
      }
      const oldSlugGuardRef = currentSlug ? db.collection("boatUniqueGuards").doc(`slug:${currentSlug}`) : null;
      const newSlugGuardRef = nextSlug ? db.collection("boatUniqueGuards").doc(`slug:${nextSlug}`) : null;
      await db.runTransaction(async (tx) => {
        const currentSnap = await tx.get(boatRef);
        if (!currentSnap.exists || (currentSnap.data() as { isListingBoat?: boolean })?.isListingBoat !== true) {
          throw new Error("NOT_FOUND");
        }
        const currentData = currentSnap.data() as ListingBoat;
        const currentUpdatedAt =
          typeof (currentData as { updatedAt?: unknown }).updatedAt === "number"
            ? ((currentData as { updatedAt?: number }).updatedAt as number)
            : null;
        if (
          (currentUpdatedAt == null && lastKnownUpdatedAt != null) ||
          (currentUpdatedAt != null && currentUpdatedAt !== lastKnownUpdatedAt)
        ) {
          throw new Error("STALE_WRITE");
        }
        if (newSlugGuardRef) {
          const newSlugGuardSnap = await tx.get(newSlugGuardRef);
          if (newSlugGuardSnap.exists) {
            const guardedBoatId = (newSlugGuardSnap.data() as { boatId?: string }).boatId;
            if (guardedBoatId && guardedBoatId !== id) {
              throw new Error("SLUG_CONFLICT");
            }
          } else {
            const legacySlugMatch = await tx.get(
              db.collection("boats").where("isListingBoat", "==", true).where("slug", "==", nextSlug).limit(2)
            );
            const conflict = legacySlugMatch.docs.find((doc) => doc.id !== id);
            if (conflict) throw new Error("SLUG_CONFLICT");
          }
          tx.set(newSlugGuardRef, { keyType: "slug", slug: nextSlug, boatId: id, updatedAt: Date.now() });
        }
        if (oldSlugGuardRef && oldSlugGuardRef.path !== newSlugGuardRef?.path) {
          const oldGuardSnap = await tx.get(oldSlugGuardRef);
          if (oldGuardSnap.exists && (oldGuardSnap.data() as { boatId?: string }).boatId === id) {
            tx.delete(oldSlugGuardRef);
          }
        }
        tx.update(boatRef, updateData);
      });
    }
    return NextResponse.json({
      id,
      ...(slugChangeWarning ? { warning: slugChangeWarning } : {}),
      ...(holdReleaseSummary ? { holdRelease: holdReleaseSummary } : {}),
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "STALE_WRITE") {
        return NextResponse.json(
          { error: "This boat was updated in another tab. Refresh and retry your changes.", code: "STALE_WRITE" },
          { status: 409 }
        );
      }
      if (err.message === "SLUG_CONFLICT") {
        return NextResponse.json(
          { error: "Slug is already in use by another boat. Choose a unique slug." },
          { status: 409 }
        );
      }
      if (err.message === "NOT_FOUND") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }
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
    if (!boatSnap.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const boatData = boatSnap.data() as { isListingBoat?: boolean; slug?: string };
    if (boatData?.isListingBoat !== true) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const slugToRelease =
      typeof boatData.slug === "string" && boatData.slug.trim() ? boatData.slug.trim() : null;

    const activeBookingSnap = await db
      .collection("bookings")
      .where("boatId", "==", id)
      .where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
      .get();
    if (!activeBookingSnap.empty) {
      const bookingIds = activeBookingSnap.docs.map((d) => d.id);
      return NextResponse.json(
        {
          error: "Cannot delete boat with active bookings. Cancel or reassign these bookings first.",
          bookingIds,
        },
        { status: 409 }
      );
    }
    const nonOpenSlotSnap = await boatRef.collection("slots").where("status", "!=", "open").limit(50).get();
    if (!nonOpenSlotSnap.empty) {
      return NextResponse.json(
        {
          error: "Cannot delete boat while non-open slots exist. Release or resolve booked/held/blocked slots first.",
          slotIds: nonOpenSlotSnap.docs.map((d) => d.id),
        },
        { status: 409 }
      );
    }
    const activeHoldsSnap = await db
      .collection("holds")
      .where("boatId", "==", id)
      .where("status", "==", "active")
      .limit(50)
      .get();
    if (!activeHoldsSnap.empty) {
      return NextResponse.json(
        {
          error: "Cannot delete boat while active holds exist. Release or let holds expire first.",
          holdIds: activeHoldsSnap.docs.map((d) => d.id),
        },
        { status: 409 }
      );
    }

    const subcollections = ["rates", "slots", "addons"];
    for (const sub of subcollections) {
      const snap = await boatRef.collection(sub).get();
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      if (!snap.empty) await batch.commit();
    }
    await boatRef.delete();
    if (slugToRelease) {
      try {
        await db.collection("boatUniqueGuards").doc(`slug:${slugToRelease}`).delete();
      } catch {
        /* best-effort: do not fail delete if guard cleanup fails */
      }
    }
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
