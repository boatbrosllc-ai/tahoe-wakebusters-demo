import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { validateAndApplyDiscount } from "@/lib/booking/discount";
import {
  normalizeDiscountCodeInput,
  validateDiscountCodeLength,
} from "@/lib/booking/discount-code-input";
import { checkRateLimitValidateDiscount, getClientKey } from "@/lib/booking/rate-limit";
import { generateIncidentCode } from "@/lib/booking/debug";
import { computeValidateDiscountTotalCents } from "@/lib/booking/compute-validate-discount-total";
import type { BookingPricing, Discount, Hold } from "@/lib/booking/types";

export const dynamic = "force-dynamic";

/** Constant-time delay (ms) when returning invalid to avoid timing-based oracles. */
const INVALID_RESPONSE_DELAY_MS = 80;

/** Reject obviously manipulated client totals when a fallback path is used. */
const MIN_TOTAL_CENTS_SANITY = 100;

/** Discount base = `pricing.totalCents` (subtotal before tip including tax and fees, excluding tip and discount). Must match `computePricing()` output. */

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
  try {
    const body = await request.json().catch(() => ({}));
    const codeRaw = typeof body.code === "string" ? body.code : "";
    const code = normalizeDiscountCodeInput(codeRaw);

    const slotId = typeof body.slotId === "string" ? body.slotId.trim() : "";
    const rateId = typeof body.rateId === "string" ? body.rateId.trim() : "";
    const experienceId = typeof body.experienceId === "string" ? body.experienceId.trim() : "";
    if (!slotId || !rateId || !experienceId) {
      await new Promise((r) => setTimeout(r, INVALID_RESPONSE_DELAY_MS));
      return NextResponse.json(
        { valid: false, error: "slotId, rateId, and experienceId are required" },
        { status: 400 }
      );
    }

    const boatId = typeof body.boatId === "string" ? body.boatId.trim() : "";
    const partySize =
      typeof body.partySize === "number" && Number.isFinite(body.partySize)
        ? Math.max(1, Math.floor(body.partySize))
        : 1;
    const bookingMode = body.bookingMode === "charter" ? ("charter" as const) : ("shared" as const);
    const addonSelectionsRaw = body.addonSelections;
    const addonSelections = Array.isArray(addonSelectionsRaw)
      ? addonSelectionsRaw
          .map((row: unknown) => {
            if (!row || typeof row !== "object") return null;
            const o = row as { addonId?: unknown; qty?: unknown };
            const addonId = typeof o.addonId === "string" ? o.addonId.trim() : "";
            const qty = typeof o.qty === "number" && Number.isFinite(o.qty) ? Math.max(0, Math.floor(o.qty)) : 0;
            if (!addonId || qty <= 0) return null;
            return { addonId, qty };
          })
          .filter((x): x is { addonId: string; qty: number } => x != null)
      : [];

    const codeLengthCheck = validateDiscountCodeLength(code);
    if (!codeLengthCheck.ok) {
      await new Promise((r) => setTimeout(r, INVALID_RESPONSE_DELAY_MS));
      return NextResponse.json({ valid: false, error: codeLengthCheck.error }, { status: 400 });
    }

    const db = getDb();
    let holdPricing: BookingPricing | null = null;
    const holdId = typeof body.holdId === "string" ? body.holdId.trim() : "";
    if (holdId) {
      const holdSnap = await db.collection("holds").doc(holdId).get();
      if (holdSnap.exists) {
        const hold = holdSnap.data() as Hold;
        if (hold.pricing) {
          holdPricing = hold.pricing;
        }
      }
    }

    const serverTotal = await computeValidateDiscountTotalCents(db, {
      holdPricing,
      slotId,
      rateId,
      experienceId,
      boatId: boatId || null,
      partySize,
      bookingMode,
      addonSelections,
    });
    if (serverTotal == null) {
      await new Promise((r) => setTimeout(r, INVALID_RESPONSE_DELAY_MS));
      return NextResponse.json(
        { valid: false, error: "Could not verify order total; please try again" },
        { status: 422 }
      );
    }
    const totalCents = serverTotal;
    if (totalCents < MIN_TOTAL_CENTS_SANITY) {
      await new Promise((r) => setTimeout(r, INVALID_RESPONSE_DELAY_MS));
      return NextResponse.json(
        { valid: false, error: "Could not compute a valid order total for this code" },
        { status: 400 }
      );
    }

    const discountSnap = await db.collection("discounts").where("code", "==", code).limit(1).get();
    const discountDoc = discountSnap.empty ? null : (discountSnap.docs[0].data() as Discount);

    const result = validateAndApplyDiscount(discountDoc, totalCents);

    if (!result.valid) {
      console.warn("[booking:validate-discount] invalid code attempt", {
        clientKey: clientKey.slice(0, 30),
        codeLength: code.length,
        hasDoc: !!discountDoc,
      });
      await new Promise((r) => setTimeout(r, INVALID_RESPONSE_DELAY_MS));
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
