/**
 * Block a single slot (admin). Creates the slot doc if it doesn't exist.
 * POST body: { experienceId, slotId }
 * Auth: Bearer BLOCK_SECRET/SEED_SECRET, or valid admin session cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { requireAdminSession } from "@/lib/admin-auth-firebase";

async function isAllowed(request: NextRequest): Promise<boolean> {
  const secret = process.env.BLOCK_SECRET ?? process.env.SEED_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  return unauthorized === null;
}

export async function POST(request: NextRequest) {
  try {
    if (process.env.NODE_ENV === "production" && !(await isAllowed(request))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await request.json();
    const experienceId = typeof body?.experienceId === "string" ? body.experienceId : null;
    const slotId = typeof body?.slotId === "string" ? body.slotId : null;
    if (!experienceId || !slotId) {
      return NextResponse.json({ error: "experienceId and slotId required" }, { status: 400 });
    }
    const parsed = parseSlotId(slotId);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid slotId format (expected YYYY-MM-DD-HH-D)" }, { status: 400 });
    }
    const db = getDb();
    const { FieldValue, Timestamp } = getFirestoreExports();
    const slotRef = db.collection("experiences").doc(experienceId).collection("slots").doc(slotId);
    const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours);
    await slotRef.set({
      startAt: Timestamp.fromDate(start),
      endAt: Timestamp.fromDate(end),
      status: "blocked",
      holdId: null,
      bookingId: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, slotId });
  } catch (err) {
    console.error("[block-slot]", err);
    return NextResponse.json({ error: "Failed to block slot" }, { status: 500 });
  }
}
