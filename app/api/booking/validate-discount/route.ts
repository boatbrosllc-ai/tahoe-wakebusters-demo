import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { validateAndApplyDiscount } from "@/lib/booking/discount";
import { checkRateLimitValidateDiscount, getClientKey } from "@/lib/booking/rate-limit";
import { generateIncidentCode } from "@/lib/booking/debug";
import type { Discount } from "@/lib/booking/types";

export const dynamic = "force-dynamic";

/** Minimum code length to reduce enumeration and avoid timing oracles on very short inputs. */
const MIN_CODE_LENGTH = 4;

/** Constant-time delay (ms) when returning invalid to avoid timing-based oracles. */
const INVALID_RESPONSE_DELAY_MS = 80;

export async function POST(request: NextRequest) {
  const clientKey = getClientKey(request);
  const rl = await checkRateLimitValidateDiscount(clientKey);
  if (!rl.allowed) {
    if (rl.serverError) {
      const incidentCode = generateIncidentCode();
      console.warn("[booking:validate-discount] rate limit service unavailable (503)", { incidentCode });
      return NextResponse.json(
        { error: "Service temporarily unavailable. Please try again shortly.", incidentCode },
        { status: 503 }
      );
    }
    const retryAfter = rl.retryAfterMs ? Math.ceil(rl.retryAfterMs / 1000) : 60;
    return NextResponse.json(
      { error: "Too many requests. Please try again in a moment." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }
  const startTime = Date.now();
  try {
    const body = await request.json().catch(() => ({}));
    const codeRaw = typeof body.code === "string" ? body.code.trim() : "";
    const totalCents = typeof body.totalCents === "number" ? Math.max(0, Math.floor(body.totalCents)) : 0;
    const code = codeRaw.toUpperCase();

    if (!code || code.length < MIN_CODE_LENGTH) {
      await new Promise((r) => setTimeout(r, INVALID_RESPONSE_DELAY_MS));
      return NextResponse.json({ valid: false, error: "Enter a discount code" }, { status: 400 });
    }

    const db = getDb();
    const discountSnap = await db.collection("discounts").where("code", "==", code).limit(1).get();
    const discountDoc = discountSnap.empty ? null : (discountSnap.docs[0].data() as Discount);

    const result = validateAndApplyDiscount(discountDoc, totalCents);

    if (!result.valid) {
      console.warn("[booking:validate-discount] invalid code attempt", {
        clientKey: clientKey.slice(0, 30),
        codeLength: code.length,
        hasDoc: !!discountDoc,
      });
      await new Promise((r) => setTimeout(r, Math.max(0, INVALID_RESPONSE_DELAY_MS - (Date.now() - startTime))));
      return NextResponse.json({ valid: false, error: result.error }, { status: 422 });
    }

    return NextResponse.json({
      valid: true,
      discountCents: result.discountCents,
      code: result.discount.code,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Validation failed";
    return NextResponse.json({ valid: false, error: message }, { status: 500 });
  }
}
