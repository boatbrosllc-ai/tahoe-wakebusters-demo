/**
 * GET /api/health
 * Readiness check for deployment. Returns 200 when critical config is present and Firebase is reachable; 503 otherwise.
 *
 * Public (anonymous): response includes high-level status (ok/degraded), rate limit readiness, and whether
 * RELEASE_TOKEN_SECRET / RECEIPT_TOKEN_SECRET are configured (no secret values).
 * Privileged: full diagnostic fields (firebase, stripe, firebaseDetail, releaseTokenSigning, manageBookingSecret,
 * rateLimit, rateLimitDetail) for operators. Use header X-Internal-Health-Secret: <HEALTH_INTERNAL_SECRET>
 * or admin session to get detailed diagnostics.
 */

import { NextRequest, NextResponse } from "next/server";
import { safeHasFirebaseConfig, hasStripeConfig, getFirebaseConfigStatus } from "@/lib/booking/env";
import { hasReleaseTokenSecret } from "@/lib/booking/releaseToken";
import { getClientKey, isRateLimitReadyForProduction } from "@/lib/booking/rate-limit";
import { bookingReady, isLegacyFallbackSafe } from "@/lib/booking/booking-runtime-state";
import {
  hasReceiptTokenSecretConfigured,
  isReceiptAndManageSecretsDistinctInProduction,
} from "@/lib/booking/receipt-token-secret";
import { verifyAdminSessionCookie } from "@/lib/admin-auth-firebase";
import { getGaMeasurementId } from "@/lib/ga-measurement-id";

async function isPrivilegedHealthRequest(request: NextRequest): Promise<boolean> {
  const internalSecret = process.env.HEALTH_INTERNAL_SECRET?.trim();
  if (internalSecret) {
    const headerSecret = request.headers.get("x-internal-health-secret")?.trim();
    if (headerSecret && headerSecret === internalSecret) return true;
  }
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader && (await verifyAdminSessionCookie(cookieHeader))) return true;
  return false;
}

export async function GET(request: NextRequest) {
  const privileged = await isPrivilegedHealthRequest(request);

  const checks: Record<string, unknown> = {};
  let ok = true;

  if (!safeHasFirebaseConfig()) {
    checks.firebase = "not_configured";
    if (privileged) {
      try {
        checks.firebaseDetail = getFirebaseConfigStatus();
      } catch {
        checks.firebaseDetail = { summary: "Could not read Firebase env status." };
      }
    }
    ok = false;
  } else {
    try {
      const { getDb } = await import("@/lib/booking/firebase-admin");
      const db = getDb();
      await db.collection("experiences").limit(1).get();
      checks.firebase = "ok";
      const legacyBacklogProbe = await db.collection("bookings").where("startDateStr", "==", null).limit(5001).get();
      const legacyMissingCountCapped = legacyBacklogProbe.size;
      checks.legacyBookingMissingStartDateStrCount = legacyMissingCountCapped;

      if (process.env.DISABLE_LEGACY_BOOKING_FALLBACK === "true") {
        if (legacyMissingCountCapped > 0) {
          console.error(
            "[health] DISABLE_LEGACY_BOOKING_FALLBACK=true but bookings with startDateStr==null still exist. " +
              "Run startDateStr backfill to completion before relying on fallback-disabled overlap checks."
          );
          checks.legacyBookingStartDateStrBackfill = "incomplete";
          ok = false;
        } else {
          checks.legacyBookingStartDateStrBackfill = "ok";
        }
      } else if (privileged) {
        checks.legacyBookingStartDateStrBackfill = "not_required";
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      checks.firebase = msg.includes("missing") || msg.includes("config") ? "not_configured" : "error";
      ok = false;
    }
  }

  checks.stripe = hasStripeConfig() ? "ok" : "not_configured";
  if (checks.stripe !== "ok") ok = false;

  if (privileged) {
    checks.rateLimitClientKey = getClientKey(request);
    checks.releaseTokenSigning = hasReleaseTokenSecret() ? "ok" : "not_configured";
    checks.manageBookingSecret = process.env.MANAGE_BOOKING_SECRET?.trim() ? "ok" : "not_configured";
    checks.receiptTokenSecret = hasReceiptTokenSecretConfigured() ? "ok" : "not_configured";
    checks.receiptAndManageSecretsDistinct = isReceiptAndManageSecretsDistinctInProduction() ? "ok" : "not_configured";
    const isProduction = process.env.NODE_ENV === "production";
    checks.disableLegacyBookingFallback = isProduction
      ? (process.env.DISABLE_LEGACY_BOOKING_FALLBACK === "true" ? "configured" : "not_configured")
      : "n/a";
    checks.disableLegacyHoldsFallback = isProduction
      ? (process.env.DISABLE_LEGACY_HOLDS_FALLBACK === "true" ? "configured" : "not_configured")
      : "n/a";
    checks.adminEdgeSecret = isProduction
      ? (process.env.ADMIN_EDGE_SECRET?.trim() ? "configured" : "not_configured")
      : "n/a";
  }

  const gaMeasurementId = getGaMeasurementId();
  checks.ga4 = {
    enabled: !!gaMeasurementId,
    measurementId: gaMeasurementId,
  };

  /** Non-sensitive: clarifies that health does not observe browser tag delivery. */
  const diagnosticsHint =
    "This endpoint validates server-side configuration only; it does not confirm client-side GA request delivery (e.g. gtag/js or collect). Netlify production deploys run a browser smoke test for loader + collect requests.";
  checks.diagnosticsHint = diagnosticsHint;

  const rateLimitReady = isRateLimitReadyForProduction();
  checks.rateLimitReady = rateLimitReady;
  checks.rateLimit = rateLimitReady ? "ok" : "degraded";
  checks.bookingReady = bookingReady ? "ok" : "degraded";
  checks.legacyFallbackSafe = isLegacyFallbackSafe ? "ok" : "degraded";
  if (!bookingReady) ok = false;
  if (!isLegacyFallbackSafe) ok = false;
  const releaseTokenConfigured = hasReleaseTokenSecret();
  const receiptTokenConfigured = hasReceiptTokenSecretConfigured();
  checks.releaseTokenSecret = releaseTokenConfigured ? "ok" : "not_configured";
  checks.receiptTokenSecret = receiptTokenConfigured ? "ok" : "not_configured";
  if (process.env.NODE_ENV === "production") {
    if (!releaseTokenConfigured) {
      ok = false;
    }
    if (receiptTokenConfigured && !isReceiptAndManageSecretsDistinctInProduction()) {
      ok = false;
    }
  }
  if (!rateLimitReady) {
    if (privileged) {
      checks.rateLimitDetail =
        process.env.NODE_ENV === "production"
          ? "Production requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or RATE_LIMIT_* equivalents) for booking endpoints; otherwise rate limiting is disabled."
          : "Redis not configured; in-memory store used (dev only).";
    }
    ok = false;
  }

  const status = ok ? "ok" : "degraded";
  const rateLimit = rateLimitReady ? "ok" : "degraded";
  const body = privileged
    ? { status, rateLimit, ...checks }
    : {
        status,
        rateLimit,
        rateLimitReady,
        releaseTokenSecret: checks.releaseTokenSecret,
        receiptTokenSecret: checks.receiptTokenSecret,
        bookingReady: checks.bookingReady,
        legacyFallbackSafe: checks.legacyFallbackSafe,
        firebase: checks.firebase,
        stripe: checks.stripe,
        ga4: checks.ga4,
        diagnosticsHint: checks.diagnosticsHint,
      };
  const statusCode = ok ? 200 : 503;
  return NextResponse.json(body, { status: statusCode });
}
