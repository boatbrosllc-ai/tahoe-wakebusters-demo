/**
 * Block a single slot (admin). Creates a block doc (Google Calendar–style); slots API respects blocks.
 * POST body: { experienceId, slotId, boatId?: string }
 * When boatId is provided (required for listing experiences), block applies to that boat only.
 * Auth: middleware (admin path) + Bearer BLOCK_SECRET or valid admin session cookie (defence-in-depth).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { getAdminEmailFromSessionCookie, requireAdminSession } from "@/lib/admin-auth-firebase";
import { timingSafeStringEqual } from "@/lib/booking/secure-compare";
import { findBlockConflicts } from "@/lib/booking/block-conflict-check";
import { writeAdminAuditLog } from "@/lib/booking/admin-audit-log";

async function resolveBlockSlotAuth(
  request: NextRequest
): Promise<{ ok: boolean; adminEmail: string | null; actorType: "admin_session" | "block_secret_automation" }> {
  const secret = process.env.BLOCK_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (secret && timingSafeStringEqual(auth, `Bearer ${secret}`)) {
    return { ok: true, adminEmail: null, actorType: "block_secret_automation" };
  }
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return { ok: false, adminEmail: null, actorType: "admin_session" };
  const adminEmail = await getAdminEmailFromSessionCookie(request.headers.get("cookie"));
  return { ok: true, adminEmail, actorType: "admin_session" };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveBlockSlotAuth(request);
    if (!auth.ok) {
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
    const conflicts = await findBlockConflicts({
      db,
      variantIds: experienceIdVariants,
      blockStart: start,
      blockEnd: end,
      boatId,
      now: new Date(),
    });
    if (conflicts.length > 0) {
      return NextResponse.json(
        { error: "Block overlaps active holds or bookings", conflicts },
        { status: 409 }
      );
    }

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

    const firstRef = await db.collection("blocks").add({
      experienceId,
      experienceCanonicalId: experienceId,
      experienceSlug: experienceSlug || null,
      slugVariants: experienceIdVariants,
      boatId: boatId ?? null,
      startAt: Timestamp.fromDate(start),
      endAt: Timestamp.fromDate(end),
      note: null,
      slotId,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: auth.actorType === "admin_session" ? auth.adminEmail ?? null : null,
    });
    void writeAdminAuditLog("block_slot", {
      action: "block",
      experienceId,
      slotId,
      boatId,
      blockId: firstRef.id,
      adminEmail: auth.adminEmail,
      actorType: auth.actorType,
    });
    return NextResponse.json({ ok: true, blockId: firstRef.id, slotId, boatId });
  } catch (err) {
    console.error("[admin/blocks/block-slot]", err);
    return NextResponse.json({ error: "Failed to block slot" }, { status: 500 });
  }
}
