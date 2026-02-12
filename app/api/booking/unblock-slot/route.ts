/**
 * Unblock a single slot (admin). Deletes the slot doc so it becomes available again.
 * Only allowed when slot status is "blocked". For held slots use release-hold; for booked use cancel booking.
 * POST body: { experienceId, slotId }
 * Auth: Bearer BLOCK_SECRET/SEED_SECRET, or valid admin session cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { parseSlotId } from "@/lib/booking/experience-slots";
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
    if (!parseSlotId(slotId)) {
      return NextResponse.json({ error: "Invalid slotId format" }, { status: 400 });
    }
    const db = getDb();
    const slotRef = db.collection("experiences").doc(experienceId).collection("slots").doc(slotId);
    const slotSnap = await slotRef.get();
    if (!slotSnap.exists) {
      return NextResponse.json({ ok: true, message: "Slot already open" });
    }
    const slot = slotSnap.data() as { status?: string };
    if (slot.status !== "blocked") {
      return NextResponse.json(
        { error: "Only blocked slots can be unblocked. Release hold or cancel booking for held/booked slots." },
        { status: 400 }
      );
    }
    await slotRef.delete();
    return NextResponse.json({ ok: true, slotId });
  } catch (err) {
    console.error("[unblock-slot]", err);
    return NextResponse.json({ error: "Failed to unblock slot" }, { status: 500 });
  }
}
