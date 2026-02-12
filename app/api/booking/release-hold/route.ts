/**
 * Release a hold so the slot goes back to open. Used when the user cancels
 * checkout (cancel URL includes holdId). No auth required — holdId is unguessable.
 * POST body: { holdId: string } or GET ?holdId=...
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import type { Hold, Slot } from "@/lib/booking/types";

function getHoldId(request: NextRequest): string | null {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return null; // POST with JSON body handled in POST
  }
  return request.nextUrl.searchParams.get("holdId");
}

export async function POST(request: NextRequest) {
  try {
    let holdId: string | null = null;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      holdId = typeof (body as { holdId?: string }).holdId === "string" ? (body as { holdId: string }).holdId : null;
    }
    if (!holdId) holdId = request.nextUrl.searchParams.get("holdId");
    if (!holdId || holdId.length < 10) {
      return NextResponse.json({ error: "holdId required" }, { status: 400 });
    }

    const db = getDb();
    const { FieldValue } = getFirestoreExports();
    const holdRef = db.collection("holds").doc(holdId);
    const holdSnap = await holdRef.get();
    if (!holdSnap.exists) {
      return NextResponse.json({ released: false, message: "Hold not found or already released" });
    }
    const hold = holdSnap.data() as Hold;
    if (hold.status !== "active") {
      return NextResponse.json({ released: false, message: "Hold already released or converted" });
    }

    const experienceId = hold.experienceId as string | undefined;
    const boatId = hold.boatId as string | undefined;
    const slotId = hold.slotId as string;
    if (!slotId || (!experienceId && !boatId)) {
      return NextResponse.json({ error: "Invalid hold" }, { status: 400 });
    }

    const slotRef = boatId
      ? db.collection("boats").doc(boatId).collection("slots").doc(slotId)
      : db.collection("experiences").doc(experienceId!).collection("slots").doc(slotId);

    await db.runTransaction(async (tx) => {
      const slotSnap = await tx.get(slotRef);
      if (!slotSnap.exists) {
        await tx.update(holdRef, { status: "expired" });
        return;
      }
      const slot = slotSnap.data() as Slot;
      if (slot.holdId !== holdId) {
        await tx.update(holdRef, { status: "expired" });
        return;
      }
      tx.update(slotRef, {
        status: "open",
        holdId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(holdRef, { status: "expired" });
    });

    return NextResponse.json({ released: true });
  } catch (err) {
    console.error("[release-hold]", err);
    return NextResponse.json({ error: "Failed to release hold" }, { status: 500 });
  }
}

/** GET so cancel page can call /api/booking/release-hold?holdId=... without CORS preflight */
export async function GET(request: NextRequest) {
  const holdId = request.nextUrl.searchParams.get("holdId");
  if (!holdId || holdId.length < 10) {
    return NextResponse.json({ error: "holdId required" }, { status: 400 });
  }

  const db = getDb();
  const { FieldValue } = getFirestoreExports();
  const holdRef = db.collection("holds").doc(holdId);
  const holdSnap = await holdRef.get();
  if (!holdSnap.exists) {
    return NextResponse.json({ released: false, message: "Hold not found or already released" });
  }
  const hold = holdSnap.data() as Hold;
  if (hold.status !== "active") {
    return NextResponse.json({ released: false, message: "Hold already released or converted" });
  }

  const experienceId = hold.experienceId as string | undefined;
  const boatId = hold.boatId as string | undefined;
  const slotId = hold.slotId as string;
  if (!slotId || (!experienceId && !boatId)) {
    return NextResponse.json({ error: "Invalid hold" }, { status: 400 });
  }

  const slotRef = boatId
    ? db.collection("boats").doc(boatId).collection("slots").doc(slotId)
    : db.collection("experiences").doc(experienceId!).collection("slots").doc(slotId);

  await db.runTransaction(async (tx) => {
    const slotSnap = await tx.get(slotRef);
    if (!slotSnap.exists) {
      await tx.update(holdRef, { status: "expired" });
      return;
    }
    const slot = slotSnap.data() as Slot;
    if (slot.holdId !== holdId) {
      await tx.update(holdRef, { status: "expired" });
      return;
    }
    tx.update(slotRef, {
      status: "open",
      holdId: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(holdRef, { status: "expired" });
  });

  return NextResponse.json({ released: true });
}
