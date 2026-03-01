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
    if (!input) {
      return NextResponse.json({ error: "holdId required" }, { status: 400 });
    }
    const db = getDb();
    const { Timestamp } = getFirestoreExports();
    const holdRef = db.collection("holds").doc(input.holdId);
    const holdSnap = await holdRef.get();
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

    // Init stripe early so we can reuse an existing open session and skip all downstream work.
    const stripe = getStripe();
    const existingSessionId = (hold as { checkoutSessionId?: string }).checkoutSessionId;
    if (existingSessionId) {
      try {
        const existingSession = await stripe.checkout.sessions.retrieve(existingSessionId);
        if (existingSession.status === "open") {
          if (input.embedded && existingSession.client_secret) {
            return NextResponse.json({ clientSecret: existingSession.client_secret, sessionId: existingSession.id });
          }
          if (existingSession.url) {
            return NextResponse.json({ url: existingSession.url, sessionId: existingSession.id });
          }
        }
      } catch (sessionErr) {
        console.warn("[create-checkout-session] Failed to retrieve existing session, creating new one", existingSessionId, sessionErr);
      }
    }

    const hasExperience = !!hold.experienceId;
    const hasBoat = !!hold.boatId;
    const isListingBoatFlow = hasExperience && hasBoat;
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
      ticketQty: hold.pricingType === "ticketed" && (hold as { bookingMode?: string }).bookingMode === "shared"
        ? hold.partySize
        : undefined,
      unitPriceCents: hold.pricingType === "ticketed"
        && (hold as { bookingMode?: string }).bookingMode === "shared"
        && hold.effectiveRateCents != null
        ? hold.effectiveRateCents
        : undefined,
    });
    const holdDiscountCode = (hold as { discountCode?: string }).discountCode;
    const holdDiscountCents = (hold as { discountCents?: number }).discountCents ?? 0;
    const baseUrl = bookingEnv.appBaseUrl;
    let stripeCouponId: string | undefined;
    // Reuse a previously created coupon for this hold; create with an idempotency key if new.
    const holdStripeCouponId = (hold as { stripeCouponId?: string }).stripeCouponId;
    if (holdStripeCouponId) {
      stripeCouponId = holdStripeCouponId;
    } else if (holdDiscountCode && holdDiscountCents > 0) {
      const coupon = await stripe.coupons.create(
        {
          amount_off: holdDiscountCents,
          currency: pricing.currency,
          name: `Discount (${holdDiscountCode})`,
          duration: "once",
        },
        { idempotencyKey: `coupon-${input.holdId}` }
      );
      stripeCouponId = coupon.id;
      await holdRef.update({ stripeCouponId: coupon.id });
    }
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
      if (!stripeCouponId) sessionParams.allow_promotion_codes = true;
      sessionParams.custom_fields = [
        { key: "special_notes", label: { type: "custom", custom: "Special requests (optional)" }, type: "text" },
      ];
    }
    if (stripeCouponId) {
      sessionParams.discounts = [{ coupon: stripeCouponId }];
    }
    let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
    try {
      session = await stripe.checkout.sessions.create(sessionParams, { idempotencyKey: `cs-${input.holdId}` });
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
    console.error("[create-checkout-session]", err);
    // Surface error in response so modal can show it (and so we can fix .env or code)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
