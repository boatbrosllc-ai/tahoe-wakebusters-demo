/**
 * Block a single slot (admin). Creates a block doc (Google Calendar–style); slots API respects blocks.
 * POST body: { experienceId, slotId, boatId?: string }
 * When boatId is provided (required for listing experiences), block applies to that boat only.
 * Auth: Bearer BLOCK_SECRET, or valid admin session cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { requireAdminSession } from "@/lib/admin-auth-firebase";

async function isAllowed(request: NextRequest): Promise<boolean> {
  const secret = process.env.BLOCK_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  return unauthorized === null;
}

/**
 * Allow skipping auth only when explicitly enabled and running locally.
 * Disabled by default. Set BLOCK_SKIP_AUTH_LOCAL=1 only for local dev convenience.
 */
function isLocalDevBypassAllowed(): boolean {
  if (process.env.BLOCK_SKIP_AUTH_LOCAL !== "1" || process.env.NODE_ENV === "production") return false;
  try {
    const vercel = process.env.VERCEL;
    const netlify = process.env.NETLIFY;
    if (vercel === "1" || netlify === "1") return false;
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const skipAuth = isLocalDevBypassAllowed();
    if (!skipAuth && !(await isAllowed(request))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json();
    const experienceId = typeof body?.experienceId === "string" ? body.experienceId : null;
    const slotId = typeof body?.slotId === "string" ? body.slotId : null;
    const boatId = typeof body?.boatId === "string" ? body.boatId.trim() || null : null;
    if (!experienceId || !slotId) {
      return NextResponse.json({ error: "experienceId and slotId required" }, { status: 400 });
    }
    const parsed = parseSlotId(slotId);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid slotId format (expected YYYY-MM-DD-HH-D)" }, { status: 400 });
    }
    const db = getDb();
    const { FieldValue, Timestamp } = getFirestoreExports();
    const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);

    const expSnap = await db.collection("experiences").doc(experienceId).get();
    const experienceSlug = expSnap.exists
      ? (typeof (expSnap.data() as { slug?: string })?.slug === "string"
          ? (expSnap.data() as { slug: string }).slug.trim()
          : "")
      : "";
    const experienceIdVariants = getExperienceIdVariants(experienceId, experienceSlug);

    if (boatId) {
      const boatRef = db.collection("boats").doc(boatId);
      const boatSnap = await boatRef.get();
      if (!boatSnap.exists) {
        return NextResponse.json({ error: "Boat not found" }, { status: 404 });
      }
      const boat = boatSnap.data() as { experienceIds?: string[] };
      if (!experienceIdVariants.some((v) => boat.experienceIds?.includes(v))) {
        return NextResponse.json({ error: "Boat not assigned to this experience" }, { status: 400 });
      }
    }

    const docRef = await db.collection("blocks").add({
      experienceId,
      boatId: boatId ?? null,
      startAt: Timestamp.fromDate(start),
      endAt: Timestamp.fromDate(end),
      note: null,
      slotId,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: null,
    });
    return NextResponse.json({ ok: true, blockId: docRef.id, slotId, boatId });
  } catch (err) {
    console.error("[block-slot]", err);
    return NextResponse.json({ error: "Failed to block slot" }, { status: 500 });
  }
}
