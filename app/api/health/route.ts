/**
 * GET /api/health
 * Readiness check for deployment: Firebase and Stripe config presence.
 * Does not expose secrets. Returns 200 when critical config is present and Firebase is reachable; 503 otherwise.
 * When Firebase is not configured, includes firebaseDetail (getFirebaseConfigStatus) so you can see why (e.g. key truncated on Netlify).
 */

import { NextResponse } from "next/server";
import { safeHasFirebaseConfig, hasStripeConfig, getFirebaseConfigStatus } from "@/lib/booking/env";

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

  if (ok) {
    return NextResponse.json({ status: "ok", ...checks });
  }
  return NextResponse.json({ status: "degraded", ...checks }, { status: 503 });
}
