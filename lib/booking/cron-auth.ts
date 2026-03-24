/**
 * Shared auth for POST /api/admin/cron/*: Bearer CRON_SECRET + X-Cron-Timestamp (replay window).
 */

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeStringEqual } from "@/lib/booking/secure-compare";
import { checkRateLimit } from "@/lib/booking/rate-limit";

const CRON_TS_HEADER = "x-cron-timestamp";
/** Acceptable skew for cron timestamp (seconds). */
const CRON_TS_WINDOW_SEC = 5 * 60;

function cronRateLimitKey(): string {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return "cron:unconfigured";
  const h = createHash("sha256").update(secret, "utf8").digest("hex");
  return `cron:secret:${h.slice(0, 32)}`;
}

export async function checkCronSecretRateLimit(): Promise<{ allowed: boolean; retryAfterMs?: number; serverError?: boolean }> {
  return checkRateLimit(cronRateLimitKey());
}

/**
 * Verifies Bearer CRON_SECRET, optional rate limit, and X-Cron-Timestamp within ±5 minutes.
 * Returns null if authorized; otherwise a NextResponse to return from the route handler.
 */
export async function assertCronPostAuthorized(request: NextRequest): Promise<NextResponse | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !timingSafeStringEqual(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkCronSecretRateLimit();
  if (!rl.allowed) {
    if (rl.serverError) {
      return NextResponse.json({ error: "Rate limit service temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json(
      { error: "Too many cron requests" },
      { status: 429, headers: rl.retryAfterMs != null ? { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } : undefined }
    );
  }

  const rawTs = request.headers.get(CRON_TS_HEADER)?.trim();
  if (!rawTs) {
    return NextResponse.json(
      { error: "Missing X-Cron-Timestamp header (Unix seconds)" },
      { status: 401 }
    );
  }
  const tsSec = parseInt(rawTs, 10);
  if (!Number.isFinite(tsSec) || tsSec < 1) {
    return NextResponse.json({ error: "Invalid X-Cron-Timestamp" }, { status: 401 });
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - tsSec) > CRON_TS_WINDOW_SEC) {
    return NextResponse.json({ error: "Cron timestamp outside allowed window" }, { status: 401 });
  }

  return null;
}
