import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import {
  verifyReceiptClaimToken,
  verifyReceiptClaimTokenIgnoreExpiry,
} from "@/lib/booking/receiptToken";
import {
  verifyReleaseToken,
  verifyReleaseTokenIgnoreExpiry,
} from "@/lib/booking/releaseToken";
import { requireAdminSession } from "@/lib/admin-auth-firebase";

const PROACTIVE_RECONCILE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Marks an active hold for early rollback reconcile.
 * Requires ownership proof: release_token, receipt_claim_token, or admin session.
 * paymentIntentId alone is not sufficient.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      paymentIntentId?: string;
      holdId?: string;
      receipt_claim_token?: string;
      release_token?: string;
    };
    const paymentIntentId =
      typeof body.paymentIntentId === "string" ? body.paymentIntentId.trim() : "";
    if (!paymentIntentId) {
      return NextResponse.json({ error: "paymentIntentId required" }, { status: 400 });
    }

    const releaseToken = typeof body.release_token === "string" ? body.release_token.trim() : "";
    const receiptClaimToken =
      typeof body.receipt_claim_token === "string" ? body.receipt_claim_token.trim() : "";
    const bodyHoldId = typeof body.holdId === "string" ? body.holdId.trim() : "";

    const stripe = getStripe();
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    const piHoldId = typeof pi.metadata?.holdId === "string" ? pi.metadata.holdId.trim() : "";

    let claimHoldId = "";
    if (receiptClaimToken) {
      const claim =
        verifyReceiptClaimToken(receiptClaimToken) ??
        verifyReceiptClaimTokenIgnoreExpiry(receiptClaimToken);
      claimHoldId = claim?.holdId?.trim() ?? "";
    }

    let releaseHoldId = "";
    if (releaseToken) {
      const rel =
        verifyReleaseToken(releaseToken) ?? verifyReleaseTokenIgnoreExpiry(releaseToken);
      releaseHoldId = rel?.holdId?.trim() ?? "";
    }

    const adminUnauthorized = await requireAdminSession(request.headers.get("cookie"));
    const isAdmin = adminUnauthorized === null;

    if (!claimHoldId && !releaseHoldId && !isAdmin) {
      return NextResponse.json(
        {
          error:
            "A valid release_token, receipt_claim_token, or admin session is required to flag hold rollback.",
        },
        { status: 403 }
      );
    }

    const holdId = claimHoldId || releaseHoldId || bodyHoldId || piHoldId;
    if (!holdId) return NextResponse.json({ ok: true, touched: false });
    if (piHoldId && holdId !== piHoldId) {
      return NextResponse.json({ error: "holdId mismatch" }, { status: 400 });
    }
    if (claimHoldId && holdId !== claimHoldId) {
      return NextResponse.json({ error: "receipt token mismatch" }, { status: 400 });
    }
    if (releaseHoldId && holdId !== releaseHoldId) {
      return NextResponse.json({ error: "release token mismatch" }, { status: 400 });
    }
    if (!isAdmin && !claimHoldId && !releaseHoldId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const db = getDb();
    const { Timestamp, FieldValue } = getFirestoreExports();
    const holdRef = db.collection("holds").doc(holdId);
    const holdSnap = await holdRef.get();
    if (!holdSnap.exists) return NextResponse.json({ ok: true, touched: false });

    const h = holdSnap.data() as {
      status?: string;
      rollbackPending?: boolean;
      rollbackPendingExpiresAt?: { toDate?: () => Date };
    };
    if (h.status !== "active") return NextResponse.json({ ok: true, touched: false });

    const nextDeadlineMs = Date.now() + PROACTIVE_RECONCILE_WINDOW_MS;
    const existingDeadlineMs = h.rollbackPendingExpiresAt?.toDate?.().getTime() ?? Infinity;
    const chosenDeadlineMs = Math.min(existingDeadlineMs, nextDeadlineMs);
    await holdRef.set(
      {
        rollbackPending: true,
        rollbackPendingExpiresAt: Timestamp.fromMillis(chosenDeadlineMs),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return NextResponse.json({ ok: true, touched: true });
  } catch (err) {
    console.error("[booking/trigger-reconcile-rollback-pending-holds]", err);
    return NextResponse.json({ error: "Failed to trigger reconcile" }, { status: 500 });
  }
}
