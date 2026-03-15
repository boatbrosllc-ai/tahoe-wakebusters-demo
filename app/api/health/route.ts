/**
 * GET /api/health
 * Readiness check for deployment. Returns 200 when critical config is present and Firebase is reachable; 503 otherwise.
 *
 * Public (anonymous): response is minimal to reduce reconnaissance value — only high-level status (ok/degraded).
 * Privileged: full diagnostic fields (firebase, stripe, firebaseDetail, releaseTokenSigning, manageBookingSecret,
 * rateLimit, rateLimitDetail) for operators. Use header X-Internal-Health-Secret: <HEALTH_INTERNAL_SECRET>
 * or admin session to get detailed diagnostics.
 */

import { NextRequest, NextResponse } from "next/server";
import { safeHasFirebaseConfig, hasStripeConfig, getFirebaseConfigStatus } from "@/lib/booking/env";
import { hasReleaseTokenSecret } from "@/lib/booking/releaseToken";
import { isRateLimitReadyForProduction } from "@/lib/booking/rate-limit";
import { verifyAdminSessionCookie } from "@/lib/admin-auth-firebase";

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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      checks.firebase = msg.includes("missing") || msg.includes("config") ? "not_configured" : "error";
      ok = false;
    }
  }

  checks.stripe = hasStripeConfig() ? "ok" : "not_configured";
  if (checks.stripe !== "ok") ok = false;

  if (privileged) {
    checks.releaseTokenSigning = hasReleaseTokenSecret() ? "ok" : "not_configured";
    checks.manageBookingSecret = process.env.MANAGE_BOOKING_SECRET?.trim() ? "ok" : "not_configured";
  }

  const rateLimitReady = isRateLimitReadyForProduction();
  checks.rateLimit = rateLimitReady ? "ok" : "degraded";
  if (!rateLimitReady) {
    if (privileged) {
      checks.rateLimitDetail =
        process.env.NODE_ENV === "production"
          ? "Production requires RATE_LIMIT_REDIS_REST_URL and RATE_LIMIT_REDIS_REST_TOKEN (or UPSTASH_REDIS_REST_*) for booking endpoints; otherwise all requests are rate limited."
          : "Redis not configured; in-memory store used (dev only).";
    }
    ok = false;
  }

  const status = ok ? "ok" : "degraded";
  const body = privileged ? { status, ...checks } : { status };
  const statusCode = ok ? 200 : 503;
  return NextResponse.json(body, { status: statusCode });
}
