/**
 * Creates a Stripe Checkout Session for a hold (embedded or redirect).
 * Supports two modes:
 * (a) Embedded (ui_mode: "custom"): returns clientSecret for the Payment Element modal; return_url points to success page.
 * (b) Redirect/hosted: returns url for redirect to Stripe Hosted Checkout; success_url/cancel_url with release token.
 * For flows that need fine-grained deposit vs. full-payment control, prefer POST /api/booking/create-payment-intent.
 */
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe, buildLineItems } from "@/lib/booking/stripe-client";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";
import { generateIncidentCode } from "@/lib/booking/debug";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { getDepartureInventoryRef, releaseCapacity } from "@/lib/booking/shared-departure-inventory";
import { buildAddonSelectionsForPricing, computePricing, getEffectiveRatePriceCents } from "@/lib/booking/pricing";
import { bookingEnv } from "@/lib/booking/env";
import { signReleaseToken } from "@/lib/booking/releaseToken";
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

/** Map known Stripe codes to safe user-facing messages; otherwise return generic message. */
function stripeErrorToUserMessage(details: Record<string, unknown>): string {
  const code = details.code;
  if (typeof code === "string") {
    const known: Record<string, string> = {
      card_declined: "Your card was declined. Please try another card or payment method.",
      expired_card: "Your card has expired. Please use a different card.",
      incorrect_cvc: "The security code is incorrect. Please check and try again.",
      insufficient_funds: "Insufficient funds. Please try another card.",
      processing_error: "Payment processing failed. Please try again.",
    };
    if (known[code]) return known[code];
  }
  return "Checkout is temporarily unavailable. Please try again.";
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
    const rl = await checkRateLimit(getClientKey(request));
    if (!rl.allowed) {
      if (rl.serverError) {
        const incidentCode = generateIncidentCode();
        console.warn("[create-checkout-session] rate limit service unavailable (503)", { incidentCode });
        return NextResponse.json(
          { error: "Service temporarily unavailable. Please try again shortly.", incidentCode },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rl.retryAfterMs != null ? { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } : undefined }
      );
    }
    const body = await request.json();
    const input = parseBody(body);
    if (!input) {
      return NextResponse.json({ error: "holdId required" }, { status: 400 });
    }
    const db = getDb();
    const { Timestamp, FieldValue } = getFirestoreExports();
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
    const holdStripeCouponId = (hold as { stripeCouponId?: string }).stripeCouponId;
    let stripeCouponId: string | undefined = holdStripeCouponId;
    if (holdDiscountCents > 0 && !stripeCouponId) {
      const coupon = await stripe.coupons.create(
        {
          amount_off: holdDiscountCents,
          currency: pricing.currency ?? "usd",
          name: `Discount${holdDiscountCode ? ` (${holdDiscountCode})` : ""}`,
          duration: "once",
        },
        { idempotencyKey: `coupon-cs-${input.holdId}` }
      );
      stripeCouponId = coupon.id;
    }
    const baseUrl = bookingEnv.appBaseUrl;
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
      sessionParams.return_url = baseUrl + "/booking/success?session_id={CHECKOUT_SESSION_ID}";
    } else {
      const holdExpiresAt = (hold.expiresAt as { toDate(): Date }).toDate();
      const releaseToken = signReleaseToken(input.holdId, Math.floor(holdExpiresAt.getTime() / 1000));
      sessionParams.success_url = baseUrl + "/booking/success?session_id={CHECKOUT_SESSION_ID}";
      sessionParams.cancel_url = releaseToken
        ? baseUrl + "/booking/cancel?holdId=" + encodeURIComponent(input.holdId) + "&release_token=" + encodeURIComponent(releaseToken)
        : baseUrl + "/booking/cancel?holdId=" + encodeURIComponent(input.holdId);
      sessionParams.phone_number_collection = { enabled: true };
      sessionParams.custom_fields = [
        { key: "special_notes", label: { type: "custom", custom: "Special requests (optional)" }, type: "text" },
      ];
    }
    if (stripeCouponId) {
      sessionParams.discounts = [{ coupon: stripeCouponId }];
    }
    let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
    try {
      session = await stripe.checkout.sessions.create(sessionParams, { idempotencyKey: "cs-" + input.holdId });
    } catch (e) {
      const details = formatStripeError(e);
      console.error("[create-checkout-session] Stripe create session failed:", details);
      if (stripeCouponId && !holdStripeCouponId) {
        try {
          await stripe.coupons.del(stripeCouponId);
        } catch (delErr) {
          console.error("[create-checkout-session] Failed to delete orphaned coupon", stripeCouponId, delErr);
        }
      }
      // Rollback: release slot (and shared-departure capacity when applicable) and expire hold so the slot/capacity is available again.
      try {
        const slotRefForRollback = hold.boatId
          ? db.collection("boats").doc(hold.boatId).collection("slots").doc(hold.slotId)
          : db.collection("experiences").doc(hold.experienceId!).collection("slots").doc(hold.slotId);
        const bookingMode = (hold as { bookingMode?: string }).bookingMode;
        const isSharedTicketed = bookingMode === "shared" && !!hold.experienceId;
        const parsedSlot = hold.slotId ? parseSlotId(hold.slotId) : null;
        const inventoryRef = isSharedTicketed && parsedSlot
          ? getDepartureInventoryRef(db, hold.experienceId!, parsedSlot.dateStr)
          : null;
        await db.runTransaction(async (tx) => {
          const slotSnap = await tx.get(slotRefForRollback);
          if (slotSnap.exists && (slotSnap.data() as { holdId?: string }).holdId === input.holdId) {
            tx.update(slotRefForRollback, {
              status: "open",
              holdId: FieldValue.delete(),
              updatedAt: FieldValue.serverTimestamp(),
            });
          }
          if (inventoryRef && hold.partySize != null) {
            await releaseCapacity(tx, inventoryRef, hold.partySize);
          }
          tx.update(holdRef, { status: "expired" });
        });
      } catch (rollbackErr) {
        console.error("[create-checkout-session] rollback on Stripe failure", rollbackErr);
      }
      return NextResponse.json(
        { error: stripeErrorToUserMessage(details) },
        { status: 500 }
      );
    }
    const holdUpdate: Record<string, unknown> = { checkoutSessionId: session.id };
    if (stripeCouponId && !holdStripeCouponId) holdUpdate.stripeCouponId = stripeCouponId;
    await holdRef.update(holdUpdate);
    if (input.embedded && session.client_secret) {
      return NextResponse.json({ clientSecret: session.client_secret, sessionId: session.id });
    }
    if (session.url) {
      return NextResponse.json({ url: session.url, sessionId: session.id });
    }
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  } catch (err) {
    console.error("[create-checkout-session]", err);
    return NextResponse.json(
      { error: "Checkout session failed" },
      { status: 500 }
    );
  }
}
