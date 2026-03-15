/**
 * Unblock a single slot (admin). Deletes the block doc that was created for this slot.
 * POST body: { experienceId, slotId, boatId?: string }
 * Finds block where experienceId, boatId, slotId match and deletes it.
 * Auth: Bearer BLOCK_SECRET, or valid admin session cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { parseSlotId } from "@/lib/booking/experience-slots";
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
    if (!parseSlotId(slotId)) {
      return NextResponse.json({ error: "Invalid slotId format" }, { status: 400 });
    }
    const db = getDb();

    const blocksRef = db.collection("blocks");
    const snap = boatId
      ? await blocksRef.where("experienceId", "==", experienceId).where("slotId", "==", slotId).where("boatId", "==", boatId).get()
      : await blocksRef.where("experienceId", "==", experienceId).where("slotId", "==", slotId).get();
    if (snap.empty) {
      return NextResponse.json({ ok: true, message: "No block found for this slot" });
    }
    await snap.docs[0].ref.delete();
    return NextResponse.json({ ok: true, slotId, boatId });
  } catch (err) {
    console.error("[unblock-slot]", err);
    return NextResponse.json({ error: "Failed to unblock slot" }, { status: 500 });
  }
}
