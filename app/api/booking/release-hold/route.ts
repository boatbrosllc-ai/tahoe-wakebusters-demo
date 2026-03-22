/**
 * Release a hold so the slot goes back to open. Used when the user cancels
 * checkout. Requires either (1) a signed release token (bound to holdId and expiry),
 * or (2) admin auth (Bearer BLOCK_SECRET for internal tooling, or admin session cookie) when no token.
 * POST body: { holdId: string, release_token?: string }. GET is not supported (use POST to avoid token in URL/logs).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getDepartureInventoryRef, releaseCapacity } from "@/lib/booking/shared-departure-inventory";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { verifyReleaseToken, hasReleaseTokenSecret } from "@/lib/booking/releaseToken";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { timingSafeStringEqual } from "@/lib/booking/secure-compare";
import type { Hold, Slot } from "@/lib/booking/types";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";

/**
 * Internal release without a release_token: valid admin session cookie, or Bearer BLOCK_SECRET
 * (trusted internal services only — never share BLOCK_SECRET with developer seed tooling; use SEED_SECRET for seeds only).
 */
async function isAdminAllowed(request: NextRequest): Promise<boolean> {
  const blockSecret = process.env.BLOCK_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (blockSecret && timingSafeStringEqual(auth, `Bearer ${blockSecret}`)) return true;
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  return unauthorized === null;
}

/**
 * Shared release logic: load hold, validate, run transaction to expire hold and
 * release slot (and shared-departure capacity when applicable). Caller must
 * have already validated holdId and auth (token or admin).
 * Re-reads the hold inside the transaction and only performs slot/capacity/discount
 * side effects when transitioning status from active → expired (avoids double-decrement
 * when release races cleanup or duplicate release calls).
 */
async function releaseHold(
  db: Firestore,
  holdId: string
): Promise<{ released: true } | { released: false; message: string }> {
  const { FieldValue } = getFirestoreExports();
  const holdRef = db.collection("holds").doc(holdId);
  const preSnap = await holdRef.get();
  if (!preSnap.exists) {
    return { released: false, message: "Hold not found or already released" };
  }
  const preHold = preSnap.data() as Hold;
  if (preHold.status !== "active") {
    return { released: false, message: "Hold already released or converted" };
  }

  let outcome: { released: true } | { released: false; message: string } = {
    released: false,
    message: "Hold already released or converted",
  };

  await db.runTransaction(async (tx) => {
    const holdSnap = await tx.get(holdRef);
    if (!holdSnap.exists) {
      outcome = { released: false, message: "Hold not found or already released" };
      return;
    }
    const hold = holdSnap.data() as Hold;
    if (hold.status !== "active") {
      outcome = { released: false, message: "Hold already released or converted" };
      return;
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

    let discountDocRef: DocumentReference | null = null;
    const discountDocId = (hold as { discountDocId?: string }).discountDocId;
    const discountCode = (hold as { discountCode?: string }).discountCode;
    if (discountDocId) {
      discountDocRef = db.collection("discounts").doc(discountDocId);
    } else if (discountCode) {
      const discountSnap = await tx.get(db.collection("discounts").where("code", "==", discountCode).limit(1));
      if (!discountSnap.empty) discountDocRef = discountSnap.docs[0].ref;
    }

    const applyDiscountDecrementTx = async () => {
      if (!discountDocRef) return;
      const dSnap = await tx.get(discountDocRef);
      if (dSnap.exists) {
        const d = dSnap.data() as { usedCount?: number };
        const nextCount = Math.max(0, (d.usedCount ?? 0) - 1);
        tx.update(discountDocRef, { usedCount: nextCount, updatedAt: FieldValue.serverTimestamp() });
      }
    };

    const slotSnap = await tx.get(slotRef);
    if (!slotSnap.exists) {
      if (isSharedHold && experienceId && dateStr) {
        const inventoryRef = getDepartureInventoryRef(db, experienceId, dateStr);
        await releaseCapacity(tx, inventoryRef, hold.partySize);
      }
      tx.update(holdRef, { status: "expired" });
      await applyDiscountDecrementTx();
      outcome = { released: true };
      return;
    }
    const slot = slotSnap.data() as Slot;
    if (slot.holdId !== holdId) {
      if (isSharedHold && experienceId && dateStr) {
        const inventoryRef = getDepartureInventoryRef(db, experienceId, dateStr);
        await releaseCapacity(tx, inventoryRef, hold.partySize);
      }
      tx.update(holdRef, { status: "expired" });
      await applyDiscountDecrementTx();
      outcome = { released: true };
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
    await applyDiscountDecrementTx();
    outcome = { released: true };
  });

  return outcome;
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
        if (!hasReleaseTokenSecret()) {
          console.error(
            "[release-hold] Rejecting request without release_token: RELEASE_TOKEN_SECRET is not set. Without it, create-hold cannot sign release tokens and customers cannot release holds on cancel or back navigation (slots stay locked until hold expiry)."
          );
        } else {
          console.error(
            "[release-hold] release_token missing and admin auth invalid (use Bearer BLOCK_SECRET or admin session)."
          );
        }
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
