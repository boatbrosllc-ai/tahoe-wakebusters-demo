/**
 * Client-only: when the booking modal cannot release a hold (no release_token and no receipt_claim_token),
 * record an operational alert so ops can monitor inventory stuck until natural expiry.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimitPostPayment, getClientKey } from "@/lib/booking/rate-limit";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { bookingNotReadyResponse, legacyFallbackUnsafeResponse } from "@/lib/booking/booking-readiness-response";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";

export async function POST(request: NextRequest) {
  const notReady = bookingNotReadyResponse();
  if (notReady) return notReady;
  const legacyUnsafe = legacyFallbackUnsafeResponse();
  if (legacyUnsafe) return legacyUnsafe;

  const rl = await checkRateLimitPostPayment(getClientKey(request));
  if (!rl.allowed) {
    if (rl.serverError) {
      return NextResponse.json({ error: "Rate limit service temporarily unavailable." }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: rl.retryAfterMs != null ? { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } : undefined }
    );
  }

  let holdId: string | null = null;
  try {
    const body = (await request.json().catch(() => ({}))) as { holdId?: string };
    holdId = typeof body.holdId === "string" && body.holdId.length >= 10 ? body.holdId : null;
  } catch {
    /* ignore */
  }
  if (!holdId) {
    return NextResponse.json({ error: "holdId required" }, { status: 400 });
  }

  try {
    const db = getDb();
    const { FieldValue, Timestamp } = getFirestoreExports();
    const holdRef = db.collection("holds").doc(holdId);
    const holdSnap = await holdRef.get();
    if (!holdSnap.exists) {
      return NextResponse.json({ error: "Hold not found" }, { status: 404 });
    }
    const hold = holdSnap.data() as { status?: string; expiresAt?: { toDate?: () => Date } };
    if (hold.status !== "active") {
      return NextResponse.json({ error: "Hold is not active" }, { status: 409 });
    }
    const expiresAt = hold.expiresAt?.toDate?.();
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Hold is expired" }, { status: 409 });
    }
    await holdRef.update({
      rollbackPending: true,
      rollbackPendingExpiresAt: Timestamp.fromMillis(Date.now() + 5 * 60 * 1000),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("[alert-stuck-modal-hold] failed to flag hold", { holdId }, err);
    return NextResponse.json({ error: "Failed to flag hold for rollback" }, { status: 500 });
  }

  await writeOperationalAlert({
    type: "release_hold_modal_skipped_missing_tokens",
    holdId,
    source: "release-hold-client",
    message:
      "Modal session had holdId but no release_token or receipt_claim_token; slot may remain held until hold expiry.",
  });

  return NextResponse.json({ ok: true });
}
