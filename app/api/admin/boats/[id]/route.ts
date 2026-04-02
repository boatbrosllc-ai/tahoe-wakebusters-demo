import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { collectAllActiveHoldDocsForBoat } from "@/lib/booking/admin-active-holds-query";
import { BOOKING_STATUSES_SLOT_TAKEN, type ListingBoat } from "@/lib/booking/types";
import { runExpiredHoldReleaseTransaction } from "@/lib/booking/cleanup-holds-logic";

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
    const s = b.slug.trim();
    out.slug = s ? s.toLowerCase().replace(/\s+/g, "-") : undefined;
  }
  if (typeof b.description === "string") out.description = b.description.trim();
  if (Array.isArray(b.photos)) out.photos = b.photos.filter((x): x is string => typeof x === "string");
  if (typeof b.active === "boolean") out.active = b.active;
  if (typeof b.boatType === "string") out.boatType = b.boatType.trim() || undefined;
  if (Array.isArray(b.experienceIds)) out.experienceIds = b.experienceIds.filter((x): x is string => typeof x === "string");
  if (typeof b.heroSubtitle === "string") out.heroSubtitle = b.heroSubtitle.trim();
  if (b.capacity === null) out.capacity = null;
  else if (typeof b.capacity === "number" && b.capacity > 0) out.capacity = b.capacity;
  if (typeof b.color === "string") out.color = b.color.trim() || undefined;
  else if (b.color === null) out.color = null;
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
  const force = body != null && typeof body === "object" && (body as { force?: unknown }).force === true;
  if (!parsed) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const db = getDb();
    const { FieldValue } = getFirestoreExports();
    const boatRef = db.collection("boats").doc(id);
    const boatSnap = await boatRef.get();
    if (!boatSnap.exists || (boatSnap.data() as { isListingBoat?: boolean })?.isListingBoat !== true) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const boatData = boatSnap.data() as ListingBoat & { previousSlugs?: string[] };
    const currentSlug = typeof boatData.slug === "string" ? boatData.slug.trim().toLowerCase() : "";
    const nextSlug = typeof parsed.slug === "string" ? parsed.slug.trim().toLowerCase() : currentSlug;
    if (typeof parsed.slug === "string" && nextSlug) {
      const slugConflict = await db
        .collection("boats")
        .where("slug", "==", nextSlug)
        .limit(1)
        .get();
      const conflicting = slugConflict.docs.find((d) => d.id !== id);
      if (conflicting) {
        return NextResponse.json(
          { error: "Slug is already in use by another boat. Choose a unique slug." },
          { status: 409 }
        );
      }
    }
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
      const updateData = stripUndefined(parsed as Record<string, unknown>);
      await boatRef.update(updateData);
    }
    return NextResponse.json({
      id,
      ...(slugChangeWarning ? { warning: slugChangeWarning } : {}),
      ...(holdReleaseSummary ? { holdRelease: holdReleaseSummary } : {}),
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
