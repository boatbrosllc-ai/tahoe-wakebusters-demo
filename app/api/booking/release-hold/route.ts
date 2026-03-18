/**
 * Release a hold so the slot goes back to open. Used when the user cancels
 * checkout. Requires either (1) a signed release token (bound to holdId and expiry),
 * or (2) admin auth (Bearer BLOCK_SECRET/SEED_SECRET or admin session) when no token.
 * POST body: { holdId: string, release_token?: string }. GET is not supported (use POST to avoid token in URL/logs).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getDepartureInventoryRef, releaseCapacity } from "@/lib/booking/shared-departure-inventory";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { verifyReleaseToken } from "@/lib/booking/releaseToken";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import type { Hold, Slot } from "@/lib/booking/types";
import type { Firestore } from "firebase-admin/firestore";

async function isAdminAllowed(request: NextRequest): Promise<boolean> {
  const secret = process.env.BLOCK_SECRET ?? process.env.SEED_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  return unauthorized === null;
}

/**
 * Shared release logic: load hold, validate, run transaction to expire hold and
 * release slot (and shared-departure capacity when applicable). Caller must
 * have already validated holdId and auth (token or admin).
 * Returns { released: true } on success, or { released: false, message } when
 * hold not found or already released/converted.
 */
async function releaseHold(
  db: Firestore,
  holdId: string
): Promise<{ released: true } | { released: false; message: string }> {
  const { FieldValue } = getFirestoreExports();
  const holdRef = db.collection("holds").doc(holdId);
  const holdSnap = await holdRef.get();
  if (!holdSnap.exists) {
    return { released: false, message: "Hold not found or already released" };
  }
  const hold = holdSnap.data() as Hold;
  if (hold.status !== "active") {
    return { released: false, message: "Hold already released or converted" };
  }

  const experienceId = hold.experienceId as string | undefined;
  const boatId = hold.boatId as string | undefined;
  const slotId = hold.slotId as string;
  if (!slotId || (!experienceId && !boatId)) {
    throw new Error("Invalid hold");
  }

  const slotRef = boatId
    ? db.collection("boats").doc(boatId).collection("slots").doc(slotId)
    : db.collection("experiences").doc(experienceId!).collection("slots").doc(slotId);

  const isSharedHold = (hold as { bookingMode?: string }).bookingMode === "shared";
  const dateStr =
    (hold as { startDateStr?: string }).startDateStr ?? parseSlotId(hold.slotId)?.dateStr ?? "";

  await db.runTransaction(async (tx) => {
    const slotSnap = await tx.get(slotRef);
    if (!slotSnap.exists) {
      if (isSharedHold && experienceId && dateStr) {
        const inventoryRef = getDepartureInventoryRef(db, experienceId, dateStr);
        await releaseCapacity(tx, inventoryRef, hold.partySize);
      }
      await tx.update(holdRef, { status: "expired" });
      return;
    }
    const slot = slotSnap.data() as Slot;
    if (slot.holdId !== holdId) {
      if (isSharedHold && experienceId && dateStr) {
        const inventoryRef = getDepartureInventoryRef(db, experienceId, dateStr);
        await releaseCapacity(tx, inventoryRef, hold.partySize);
      }
      await tx.update(holdRef, { status: "expired" });
      return;
    }
    tx.update(slotRef, {
      status: "open",
      holdId: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (isSharedHold && experienceId && dateStr) {
      const inventoryRef = getDepartureInventoryRef(db, experienceId, dateStr);
      await releaseCapacity(tx, inventoryRef, hold.partySize);
    }
    tx.update(holdRef, { status: "expired" });
  });

  return { released: true };
}

/** Parse holdId and release_token from POST body. */
function parseHoldParams(request: NextRequest): Promise<{ holdId: string | null; releaseToken: string | null }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return request.json().catch(() => ({})).then((body: { holdId?: string; release_token?: string }) => ({
      holdId: typeof body.holdId === "string" ? body.holdId : null,
      releaseToken: typeof body.release_token === "string" ? body.release_token : null,
    }));
  }
  return Promise.resolve({ holdId: null, releaseToken: null });
}

export async function POST(request: NextRequest) {
  try {
    const { holdId, releaseToken } = await parseHoldParams(request);
    if (!holdId || holdId.length < 10) {
      return NextResponse.json({ error: "holdId required" }, { status: 400 });
    }
    const hasToken = !!releaseToken;
    if (hasToken) {
      const payload = verifyReleaseToken(releaseToken!);
      if (!payload || payload.holdId !== holdId) {
        return NextResponse.json({ error: "Invalid or expired release link" }, { status: 401 });
      }
    } else {
      const allowed = await isAdminAllowed(request);
      if (!allowed) {
        return NextResponse.json({ error: "release_token required or admin auth (internal only)" }, { status: 400 });
      }
    }

    const db = getDb();
    const result = await releaseHold(db, holdId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "Invalid hold") {
      return NextResponse.json({ error: "Invalid hold" }, { status: 400 });
    }
    console.error("[release-hold]", err);
    return NextResponse.json({ error: "Failed to release hold" }, { status: 500 });
  }
}
