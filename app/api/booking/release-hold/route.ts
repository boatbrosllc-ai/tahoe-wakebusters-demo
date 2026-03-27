/**
 * Release a hold so the slot goes back to open. Used when the user cancels
 * checkout. Requires either (1) a signed release token (bound to holdId and expiry),
 * or (2) admin auth (Bearer RELEASE_HOLD_INTERNAL_SECRET for internal tooling, or admin session cookie) when no token.
 * POST body: { holdId: string, release_token?: string }. GET is not supported (use POST to avoid token in URL/logs).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { executeReleaseHoldTransaction } from "@/lib/booking/release-hold-transaction";
import {
  verifyReleaseToken,
  verifyReleaseTokenIgnoreExpiry,
  hasReleaseTokenSecret,
} from "@/lib/booking/releaseToken";
import { verifyReceiptClaimToken } from "@/lib/booking/receiptToken";
import { clearHoldReleaseCookie, getHoldReleaseTokenFromCookie } from "@/lib/booking/hold-release-cookie";
import { requireAdminSession, getAdminEmailFromSessionCookie } from "@/lib/admin-auth-firebase";
import { writeAdminAuditLog } from "@/lib/booking/admin-audit-log";
import { timingSafeStringEqual } from "@/lib/booking/secure-compare";
import { checkRateLimitPostPayment, getClientKey, getManageRateLimitKey } from "@/lib/booking/rate-limit";
import { bookingNotReadyResponse, legacyFallbackUnsafeResponse } from "@/lib/booking/booking-readiness-response";
import type { Hold } from "@/lib/booking/types";

/**
 * Internal release without a release_token: valid admin session cookie, or Bearer RELEASE_HOLD_INTERNAL_SECRET
 * (dedicated secret — do not reuse BLOCK_SECRET used for calendar block APIs).
 */
async function isAdminAllowed(request: NextRequest): Promise<boolean> {
  const internalSecret = process.env.RELEASE_HOLD_INTERNAL_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (internalSecret && timingSafeStringEqual(auth, `Bearer ${internalSecret}`)) return true;
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  return unauthorized === null;
}

/** Parse holdId, release_token, and receipt_claim_token from POST body. `release_token` alone is enough (payload includes holdId). */
function parseHoldParams(
  request: NextRequest
): Promise<{ holdId: string | null; releaseToken: string | null; receiptClaimToken: string | null }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return request
      .json()
      .catch(() => ({}))
      .then((body: { holdId?: string; release_token?: string; receipt_claim_token?: string }) => ({
        holdId: typeof body.holdId === "string" ? body.holdId : null,
        releaseToken: typeof body.release_token === "string" ? body.release_token : null,
        receiptClaimToken: typeof body.receipt_claim_token === "string" ? body.receipt_claim_token : null,
      }));
  }
  return Promise.resolve({ holdId: null, releaseToken: null, receiptClaimToken: null });
}

export async function POST(request: NextRequest) {
  try {
    const notReady = bookingNotReadyResponse();
    if (notReady) return notReady;
    const legacyUnsafe = legacyFallbackUnsafeResponse();
    if (legacyUnsafe) return legacyUnsafe;
    const rlIp = await checkRateLimitPostPayment(getClientKey(request));
    if (!rlIp.allowed) {
      if (rlIp.serverError) {
        return NextResponse.json(
          { error: "Rate limit service temporarily unavailable. Please try again shortly." },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: rlIp.retryAfterMs != null ? { "Retry-After": String(Math.ceil(rlIp.retryAfterMs / 1000)) } : undefined,
        }
      );
    }
    let { holdId, releaseToken, receiptClaimToken } = await parseHoldParams(request);
    if (!releaseToken) {
      const fromCookie = getHoldReleaseTokenFromCookie(request);
      if (fromCookie) releaseToken = fromCookie;
    }
    if (receiptClaimToken?.trim()) {
      const claim = verifyReceiptClaimToken(receiptClaimToken.trim());
      if (claim) {
        if (holdId && holdId !== claim.holdId) {
          return NextResponse.json({ error: "receipt_claim_token does not match holdId" }, { status: 400 });
        }
        holdId = claim.holdId;
        releaseToken = "__receipt_claim__";
      }
    }
    if (releaseToken && holdId == null) {
      const rel =
        verifyReleaseToken(releaseToken) ?? verifyReleaseTokenIgnoreExpiry(releaseToken);
      if (!rel || rel.holdId.length < 10) {
        return NextResponse.json({ error: "Invalid or expired release link" }, { status: 401 });
      }
      holdId = rel.holdId;
    }
    if (!holdId || holdId.length < 10) {
      return NextResponse.json({ error: "holdId or release_token required" }, { status: 400 });
    }
    const hasToken = !!releaseToken;
    const hasReceiptClaimPlaceholder = releaseToken === "__receipt_claim__";
    if (!hasToken) {
      const allowed = await isAdminAllowed(request);
      if (!allowed) {
        if (!hasReleaseTokenSecret()) {
          console.error(
            "[release-hold] Rejecting request without release_token: RELEASE_TOKEN_SECRET is not set. Without it, create-hold cannot sign release tokens and customers cannot release holds on cancel or back navigation (slots stay locked until hold expiry)."
          );
        } else {
          console.error(
            "[release-hold] release_token missing and admin auth invalid (use Bearer RELEASE_HOLD_INTERNAL_SECRET or admin session)."
          );
        }
        return NextResponse.json({ error: "release_token required or admin auth (internal only)" }, { status: 400 });
      }
    }

    const rlHold = await checkRateLimitPostPayment(getManageRateLimitKey(holdId));
    if (!rlHold.allowed) {
      if (rlHold.serverError) {
        return NextResponse.json(
          { error: "Rate limit service temporarily unavailable. Please try again shortly." },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: rlHold.retryAfterMs != null ? { "Retry-After": String(Math.ceil(rlHold.retryAfterMs / 1000)) } : undefined,
        }
      );
    }

    const db = getDb();
    if (hasToken && !hasReceiptClaimPlaceholder) {
      const strict = verifyReleaseToken(releaseToken!);
      if (!strict || strict.holdId !== holdId) {
        const lax = verifyReleaseTokenIgnoreExpiry(releaseToken!);
        if (!lax || lax.holdId !== holdId) {
          return NextResponse.json({ error: "Invalid or expired release link" }, { status: 401 });
        }
        const holdSnap = await db.collection("holds").doc(holdId).get();
        if (!holdSnap.exists) {
          return NextResponse.json({ error: "Invalid or expired release link" }, { status: 401 });
        }
        const holdPre = holdSnap.data() as Hold;
        if (holdPre.status !== "active") {
          return NextResponse.json({ error: "Invalid or expired release link" }, { status: 401 });
        }
        const holdExp = (holdPre.expiresAt as { toDate(): Date }).toDate();
        if (holdExp <= new Date()) {
          return NextResponse.json({ error: "Invalid or expired release link" }, { status: 401 });
        }
      }
    } else if (hasReceiptClaimPlaceholder) {
      const holdSnap = await db.collection("holds").doc(holdId).get();
      if (!holdSnap.exists) {
        return NextResponse.json({ error: "Invalid or expired release link" }, { status: 401 });
      }
      const holdPre = holdSnap.data() as Hold;
      if (holdPre.status !== "active") {
        return NextResponse.json({ error: "Invalid or expired release link" }, { status: 401 });
      }
      const holdExp = (holdPre.expiresAt as { toDate(): Date }).toDate();
      if (holdExp <= new Date()) {
        return NextResponse.json({ error: "Invalid or expired release link" }, { status: 401 });
      }
    }

    const releaseContext =
      hasToken && !hasReceiptClaimPlaceholder
        ? "api/booking/release-hold:user-release-token"
        : hasReceiptClaimPlaceholder
          ? "api/booking/release-hold:receipt-claim"
          : "api/booking/release-hold:admin-or-internal";
    const result = await executeReleaseHoldTransaction(db, holdId, { releaseContext });
    if (!hasToken && result.released) {
      const adminEmail = await getAdminEmailFromSessionCookie(request.headers.get("cookie"));
      void writeAdminAuditLog("release_hold_admin", { holdId, adminEmail: adminEmail ?? undefined });
    }
    const res = NextResponse.json(result);
    if (hasToken && !hasReceiptClaimPlaceholder) {
      clearHoldReleaseCookie(res);
    }
    return res;
  } catch (err) {
    if (err instanceof Error && err.message === "Invalid hold") {
      return NextResponse.json({ error: "Invalid hold" }, { status: 400 });
    }
    console.error("[release-hold]", err);
    return NextResponse.json({ error: "Failed to release hold" }, { status: 500 });
  }
}
