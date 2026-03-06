/**
 * GET /api/health
 * Readiness check for deployment: Firebase and Stripe config presence.
 * Does not expose secrets. Returns 200 when critical config is present and Firebase is reachable; 503 otherwise.
 * When Firebase is not configured, includes firebaseDetail (getFirebaseConfigStatus) so you can see why (e.g. key truncated on Netlify).
 * Reports release-token and manage-booking secrets for booking-start vs manage paths; reports rate-limit (Redis) readiness for production.
 */

import { NextResponse } from "next/server";
import { safeHasFirebaseConfig, hasStripeConfig, getFirebaseConfigStatus } from "@/lib/booking/env";
import { hasReleaseTokenSecret } from "@/lib/booking/releaseToken";
import { isRateLimitReadyForProduction } from "@/lib/booking/rate-limit";

export async function GET() {
  const checks: Record<string, unknown> = {};
  let ok = true;

  if (!safeHasFirebaseConfig()) {
    checks.firebase = "not_configured";
    try {
      checks.firebaseDetail = getFirebaseConfigStatus();
    } catch {
      checks.firebaseDetail = { summary: "Could not read Firebase env status." };
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

  // Booking-start paths (create-hold, create-checkout-session, create-checkout-session-direct): no secret required; tokenized release is optional.
  checks.releaseTokenSigning = hasReleaseTokenSecret() ? "ok" : "not_configured";
  // Manage-booking path (/booking/manage): requires MANAGE_BOOKING_SECRET (reported for clarity; not required for health 200).
  checks.manageBookingSecret = process.env.MANAGE_BOOKING_SECRET?.trim() ? "ok" : "not_configured";

  // Production rate limiting: Redis required in production; when missing we fail closed (all requests rate limited).
  const rateLimitReady = isRateLimitReadyForProduction();
  checks.rateLimit = rateLimitReady ? "ok" : "degraded";
  if (!rateLimitReady) {
    checks.rateLimitDetail =
      process.env.NODE_ENV === "production"
        ? "Production requires RATE_LIMIT_REDIS_REST_URL and RATE_LIMIT_REDIS_REST_TOKEN (or UPSTASH_REDIS_REST_*) for booking endpoints; otherwise all requests are rate limited."
        : "Redis not configured; in-memory store used (dev only).";
    ok = false;
  }

  if (ok) {
    return NextResponse.json({ status: "ok", ...checks });
  }
  return NextResponse.json({ status: "degraded", ...checks }, { status: 503 });
}
