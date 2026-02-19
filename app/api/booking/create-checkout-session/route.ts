/**
 * @deprecated Use POST /api/booking/create-payment-intent with Payment Element (modal checkout) instead.
 * This route remains for backwards compatibility with redirect/hosted Checkout only.
 */
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe, buildLineItems } from "@/lib/booking/stripe-client";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { buildAddonSelectionsForPricing, computePricing, getEffectiveRatePriceCents } from "@/lib/booking/pricing";
import { bookingEnv } from "@/lib/booking/env";
import type { Hold, Rate, Addon, Boat } from "@/lib/booking/types";
import type { Experience, ExperienceRate, ExperienceAddon, BoatRate, ListingBoat } from "@/lib/booking/types";

function formatStripeError(e: unknown): Record<string, unknown> {
  const err = e as Record<string, unknown> | null | undefined;
  if (!err || typeof err !== "object") return { message: String(e) };
  return {
    name: err.name,
    type: err.type,
    message: err.message,
    code: err.code,
    param: err.param,
    statusCode: err.statusCode,
    requestId: err.requestId,
    raw: err.raw,
  };
}

// #region agent log
async function debugLog(message: string, data: Record<string, unknown>) {
  try {
    await fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location: "create-checkout-session/route.ts", message, data, timestamp: Date.now() }),
    });
  } catch {
    // ignore
  }
}
// #endregion

function parseBody(body: unknown): { holdId: string; embedded?: boolean } | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const holdId = typeof o.holdId === "string" ? o.holdId : null;
  if (!holdId) return null;
  const embedded = o.embedded === true;
  return { holdId, embedded };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = parseBody(body);
    // #region agent log
    await debugLog("create-checkout-session entry", {
      hasInput: !!input,
      holdId: input?.holdId ?? null,
      hypothesisId: "H3",
    });
    // #endregion
    if (!input) {
      return NextResponse.json({ error: "holdId required" }, { status: 400 });
    }
    // #region agent log
    await debugLog("create-checkout before getDb", { holdId: input.holdId, embedded: input.embedded, hypothesisId: "H1" });
    // #endregion
    const db = getDb();
    const { Timestamp } = getFirestoreExports();
    const holdRef = db.collection("holds").doc(input.holdId);
    const holdSnap = await holdRef.get();
    // #region agent log
    await debugLog("hold fetch result", {
      holdExists: holdSnap.exists,
      hypothesisId: "H3",
    });
    // #endregion
    if (!holdSnap.exists) {
      return NextResponse.json({ error: "Hold not found" }, { status: 404 });
    }
    const hold = holdSnap.data() as Hold;
    if (hold.status !== "active") {
      return NextResponse.json({ error: "Hold expired or already used" }, { status: 400 });
    }
    const expiresAt = hold.expiresAt as { toDate(): Date };
    if (expiresAt.toDate() < new Date()) {
      return NextResponse.json({ error: "Hold expired" }, { status: 400 });
    }
    const hasExperience = !!hold.experienceId;
    const hasBoat = !!hold.boatId;
    const isListingBoatFlow = hasExperience && hasBoat;
    // #region agent log
    await debugLog("create-checkout branch", {
      hasExperience,
      hasBoat,
      isListingBoatFlow,
      rateId: hold.rateId,
      hypothesisId: "H2",
    });
    // #endregion
    let rate: Rate | ExperienceRate | BoatRate;
    const addonsById = new Map<string, Addon | ExperienceAddon>();
    if (isListingBoatFlow) {
      const rateSnap = await db.collection("experiences").doc(hold.experienceId!).collection("rates").doc(hold.rateId).get();
      if (!rateSnap.exists) {
        return NextResponse.json({ error: "Rate not found" }, { status: 404 });
      }
      rate = rateSnap.data() as ExperienceRate;
      const addonsSnap = await db.collection("experiences").doc(hold.experienceId!).collection("addons").get();
      addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as ExperienceAddon));
    } else if (hasExperience) {
      const rateSnap = await db.collection("experiences").doc(hold.experienceId!).collection("rates").doc(hold.rateId).get();
      if (!rateSnap.exists) {
        return NextResponse.json({ error: "Rate not found" }, { status: 404 });
      }
      rate = rateSnap.data() as ExperienceRate;
      const addonsSnap = await db.collection("experiences").doc(hold.experienceId!).collection("addons").get();
      addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as ExperienceAddon));
    } else {
      const boatSnap = await db.collection("boats").doc(hold.boatId!).get();
      if (!boatSnap.exists) {
        return NextResponse.json({ error: "Boat not found" }, { status: 404 });
      }
      const rateSnap = await db.collection("boats").doc(hold.boatId!).collection("rates").doc(hold.rateId).get();
      if (!rateSnap.exists) {
        return NextResponse.json({ error: "Rate not found" }, { status: 404 });
      }
      rate = rateSnap.data() as Rate;
      const addonsSnap = await db.collection("boats").doc(hold.boatId!).collection("addons").get();
      addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as Addon));
    }
    const addonsForPricing = buildAddonSelectionsForPricing(hold.addonSelections, addonsById);
    let rateForPricing: Rate | ExperienceRate | BoatRate = rate;
    let pricing: import("@/lib/booking/types").BookingPricing;
    if (hold.pricing && hold.effectiveRateCents != null) {
      rateForPricing = { ...rate, priceCents: hold.effectiveRateCents } as ExperienceRate & { priceCents: number };
      pricing = hold.pricing as import("@/lib/booking/types").BookingPricing;
    } else {
      if (hasExperience && "priceCents" in rate) {
        const parsed = parseSlotId(hold.slotId);
        if (parsed) {
          const slotStart = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0).start;
          const expDoc = await db.collection("experiences").doc(hold.experienceId!).get();
          const experience = expDoc.exists ? (expDoc.data() as Experience) : null;
          if (experience) {
            rateForPricing = { ...rate, priceCents: getEffectiveRatePriceCents(rate as { priceCents: number; priceWeekendCents?: number; priceFriSunCents?: number; priceHolidayCents?: number }, slotStart, experience.holidayDates, experience.weekendDays, experience.friSunDays) };
          }
        }
      }
      pricing = computePricing({ rate: rateForPricing, addons: addonsForPricing, currency: "usd" });
    }
    let lineItems = buildLineItems({
      pricing,
      rate: rateForPricing as Rate | ExperienceRate,
      addons: addonsForPricing,
      hold,
    });
    const holdDiscountCode = (hold as { discountCode?: string }).discountCode;
    const holdDiscountCents = (hold as { discountCents?: number }).discountCents ?? 0;
    if (holdDiscountCode && holdDiscountCents > 0) {
      lineItems = [...lineItems, {
        price_data: {
          currency: pricing.currency,
          unit_amount: -holdDiscountCents,
          product_data: { name: `Discount (${holdDiscountCode})` },
        },
        quantity: 1,
      }];
    }
    // #region agent log
    await debugLog("create-checkout before Stripe", {
      lineItemsCount: lineItems?.length ?? 0,
      hypothesisId: "H4",
    });
    // #endregion
    const baseUrl = bookingEnv.appBaseUrl;
    const stripe = getStripe();
    const metadata: Record<string, string> = {
      holdId: input.holdId,
      slotId: hold.slotId,
      rateId: hold.rateId,
    };
    if (hold.experienceId) metadata.experienceId = hold.experienceId;
    if (hold.boatId) metadata.boatId = hold.boatId;
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      line_items: lineItems,
      customer_email:
        hold.customerDraft.email === "checkout@pending.local" ? undefined : hold.customerDraft.email,
      metadata,
    };
    if (input.embedded) {
      (sessionParams as { ui_mode?: string }).ui_mode = "custom";
      sessionParams.return_url = `${baseUrl}/booking/success?session_id={CHECKOUT_SESSION_ID}`;
    } else {
      sessionParams.success_url = `${baseUrl}/booking/success?session_id={CHECKOUT_SESSION_ID}`;
      sessionParams.cancel_url = `${baseUrl}/booking/cancel?holdId=${input.holdId}`;
      sessionParams.phone_number_collection = { enabled: true };
      sessionParams.allow_promotion_codes = true;
      sessionParams.custom_fields = [
        { key: "special_notes", label: { type: "custom", custom: "Special requests (optional)" }, type: "text" },
      ];
    }
    let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
    try {
      session = await stripe.checkout.sessions.create(sessionParams);
    } catch (e) {
      const details = formatStripeError(e);
      const stripeMessage = typeof details.message === "string" ? details.message : null;
      console.error("❌ Stripe create session failed:", details);
      return NextResponse.json(
        {
          error: stripeMessage ?? "Stripe create session failed",
          details,
        },
        { status: 500 }
      );
    }
    // #region agent log
    await debugLog("Stripe session created", {
      hasUrl: !!session.url,
      hasClientSecret: !!session.client_secret,
      sessionId: session.id ?? null,
      hypothesisId: "H4",
    });
    // #endregion
    await holdRef.update({ checkoutSessionId: session.id });
    if (input.embedded && session.client_secret) {
      return NextResponse.json({ clientSecret: session.client_secret, sessionId: session.id });
    }
    if (session.url) {
      return NextResponse.json({ url: session.url, sessionId: session.id });
    }
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout session failed";
    const stack = err instanceof Error ? String(err.stack).slice(0, 500) : "";
    // #region agent log
    await debugLog("create-checkout-session threw", {
      message: String(message),
      stack,
      name: err instanceof Error ? err.name : "",
      hypothesisId: "H5",
    }).catch(() => {});
    try {
      const path = require("path") as typeof import("path");
      const fs = require("fs") as typeof import("fs");
      const logPath = path.join(process.cwd(), ".cursor", "debug.log");
      const line = JSON.stringify({ createCheckoutError: true, message: String(message), stack, name: err instanceof Error ? err.name : "", ts: Date.now() }) + "\n";
      fs.appendFileSync(logPath, line);
    } catch (_) {}
    // #endregion
    console.error("[create-checkout-session]", err);
    // Surface error in response so modal can show it (and so we can fix .env or code)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
