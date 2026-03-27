/**
 * Client-only: when the booking modal cannot release a hold (no release_token and no receipt_claim_token),
 * record an operational alert so ops can monitor inventory stuck until natural expiry.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimitPostPayment, getClientKey } from "@/lib/booking/rate-limit";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { bookingNotReadyResponse, legacyFallbackUnsafeResponse } from "@/lib/booking/booking-readiness-response";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { verifyReleaseTokenIgnoreExpiry } from "@/lib/booking/releaseToken";
import { verifyReceiptClaimTokenIgnoreExpiry } from "@/lib/booking/receiptToken";

/** Aligns with cleanup-holds cadence (~2 min) so rollbackPending is picked up quickly. */
const STUCK_MODAL_ROLLBACK_PENDING_MS = 2 * 60 * 1000;

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
  let releaseToken = "";
  let receiptClaimToken = "";
  try {
    const body = (await request.json().catch(() => ({}))) as {
      holdId?: string;
      release_token?: string;
      receipt_claim_token?: string;
    };
    holdId = typeof body.holdId === "string" && body.holdId.length >= 10 ? body.holdId : null;
    releaseToken = typeof body.release_token === "string" ? body.release_token.trim() : "";
    receiptClaimToken = typeof body.receipt_claim_token === "string" ? body.receipt_claim_token.trim() : "";
  } catch {
    /* ignore */
  }
  if (!holdId) {
    return NextResponse.json({ error: "holdId required" }, { status: 400 });
  }
  let tokenAuthorized = false;
  if (releaseToken) {
    const rel = verifyReleaseTokenIgnoreExpiry(releaseToken);
    if (rel?.holdId === holdId) tokenAuthorized = true;
  }
  if (!tokenAuthorized && receiptClaimToken) {
    const claim = verifyReceiptClaimTokenIgnoreExpiry(receiptClaimToken);
    if (claim?.holdId === holdId) tokenAuthorized = true;
  }
  if (!tokenAuthorized) {
    return NextResponse.json(
      {
        error:
          "A valid release_token or receipt_claim_token for this hold is required to flag rollback (possibly expired tokens are accepted).",
      },
      { status: 403 }
    );
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
      rollbackPendingExpiresAt: Timestamp.fromMillis(Date.now() + STUCK_MODAL_ROLLBACK_PENDING_MS),
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
