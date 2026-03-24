/**
 * Client-only: when the booking modal cannot release a hold (no release_token and no receipt_claim_token),
 * record an operational alert so ops can monitor inventory stuck until natural expiry.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimitPostPayment, getClientKey } from "@/lib/booking/rate-limit";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { bookingNotReadyResponse, legacyFallbackUnsafeResponse } from "@/lib/booking/booking-readiness-response";

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

  await writeOperationalAlert({
    type: "release_hold_modal_skipped_missing_tokens",
    holdId,
    source: "release-hold-client",
    message:
      "Modal session had holdId but no release_token or receipt_claim_token; slot may remain held until hold expiry.",
  });

  return NextResponse.json({ ok: true });
}
