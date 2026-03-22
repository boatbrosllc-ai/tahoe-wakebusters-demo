/**
 * Creates a Stripe Checkout Session for a hold (embedded or redirect).
 * When RELEASE_TOKEN_SECRET is set, the client must send `release_token` from create-hold (proof of hold possession).
 * Do not log raw `holdId` in client-visible errors or third-party analytics.
 * Supports two modes:
 * (a) Embedded (ui_mode: "custom"): returns clientSecret for the Payment Element modal; return_url points to success page.
 * (b) Redirect/hosted: returns url for redirect to Stripe Hosted Checkout; success_url/cancel_url with release token.
 * For flows that need fine-grained deposit vs. full-payment control, prefer POST /api/booking/create-payment-intent.
 */
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe, buildLineItems, buildLineItemsFromHoldPricing } from "@/lib/booking/stripe-client";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";
import { generateIncidentCode, bookingError, bookingWarn } from "@/lib/booking/debug";
import {
  acquireCheckoutSessionCreationLock,
  clearSessionCreationInflight,
  persistCheckoutSessionOnHoldWithRetry,
  rollbackCheckoutSession,
} from "@/lib/booking/checkout-session-helpers";
import { resolveHoldBookingPricing } from "@/lib/booking/hold-charge-resolver";
import { bookingEnv } from "@/lib/booking/env";
import { signReleaseToken, verifyReleaseToken, hasReleaseTokenSecret } from "@/lib/booking/releaseToken";
import { signReceiptClaimToken } from "@/lib/booking/receiptToken";
import { HOLD_PAYMENT_ATTEMPT_VERSION_META } from "@/lib/booking/constants";
import type { Hold, Rate, ExperienceRate } from "@/lib/booking/types";

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

function parseBody(body: unknown): { holdId: string; embedded?: boolean; release_token?: string } | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const holdId = typeof o.holdId === "string" ? o.holdId : null;
  if (!holdId) return null;
  const embedded = o.embedded === true;
  const release_token = typeof o.release_token === "string" ? o.release_token.trim() : undefined;
  return { holdId, embedded, ...(release_token ? { release_token } : {}) };
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
    if (hasReleaseTokenSecret()) {
      if (!input.release_token) {
        return NextResponse.json(
          { error: "release_token required (returned from create-hold with this hold)" },
          { status: 401 }
        );
      }
      const rel = verifyReleaseToken(input.release_token);
      if (!rel || rel.holdId !== input.holdId) {
        return NextResponse.json({ error: "Invalid or expired release link" }, { status: 401 });
      }
    }
    if (hold.status !== "active") {
      return NextResponse.json({ error: "Hold expired or already used" }, { status: 400 });
    }
    const expiresAt = hold.expiresAt as { toDate(): Date };
    if (expiresAt.toDate() < new Date()) {
      return NextResponse.json({ error: "Hold expired" }, { status: 400 });
    }

    const stripe = getStripe();

    const isSharedTicketed = hold.pricingType === "ticketed" && (hold as { bookingMode?: string }).bookingMode === "shared";
    let resolvedPricing: Awaited<ReturnType<typeof resolveHoldBookingPricing>>;
    try {
      resolvedPricing = await resolveHoldBookingPricing(db, hold, { mode: "checkout" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "RATE_NOT_FOUND") return NextResponse.json({ error: "Rate not found" }, { status: 404 });
      if (msg === "BOAT_NOT_FOUND") return NextResponse.json({ error: "Boat not found" }, { status: 404 });
      throw e;
    }
    const { pricing, rateForPricing, addonsForPricing, useSnapshotLineItems, ticketQtyForLineItems } = resolvedPricing;
    const unitPriceCentsForLineItems = isSharedTicketed && (hold.effectiveRateCents != null || (rateForPricing as { priceCents?: number }).priceCents != null)
      ? (hold.effectiveRateCents ?? (rateForPricing as { priceCents: number }).priceCents)
      : undefined;
    let lineItems = useSnapshotLineItems
      ? buildLineItemsFromHoldPricing({
          pricing,
          rate: rateForPricing as Rate | ExperienceRate,
          hold,
          ticketQty: ticketQtyForLineItems,
        })
      : buildLineItems({
          pricing,
          rate: rateForPricing as Rate | ExperienceRate,
          addons: addonsForPricing,
          hold,
          ticketQty: ticketQtyForLineItems,
          unitPriceCents: unitPriceCentsForLineItems,
        });
    const holdDiscountCode = (hold as { discountCode?: string }).discountCode;
    const holdDiscountCents = (hold as { discountCents?: number }).discountCents ?? 0;
    const tipCentsSanity = (hold as { tipCents?: number }).tipCents ?? 0;
    const lineItemSumCents = lineItems.reduce((acc, li) => {
      const u = li.price_data?.unit_amount;
      const q = typeof li.quantity === "number" && Number.isFinite(li.quantity) ? li.quantity : 1;
      return acc + (typeof u === "number" && Number.isFinite(u) ? u * q : 0);
    }, 0);
    const expectedLineItemsCents = pricing.totalCents + tipCentsSanity;
    const expectedPerHoldTotalCents = pricing.totalCents + tipCentsSanity - holdDiscountCents;
    if (Math.abs(lineItemSumCents - expectedLineItemsCents) > 1) {
      const diagnostic = {
        lineItemSumCents,
        expectedLineItemsCents,
        expectedPerHoldTotalCents,
        pricingTotalCents: pricing.totalCents,
        tipCents: tipCentsSanity,
        discountCents: holdDiscountCents,
        holdId: input.holdId,
      };
      console.error("[create-checkout-session] Line item sum mismatch; aborting Checkout Session creation", diagnostic);
      await clearSessionCreationInflight(holdRef, FieldValue);
      return NextResponse.json(
        { error: "Checkout is temporarily unavailable. Please try again." },
        { status: 500 }
      );
    }
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
    const holdPaymentAttemptVersion =
      typeof (hold as { paymentAttemptVersion?: number }).paymentAttemptVersion === "number"
        ? (hold as { paymentAttemptVersion?: number }).paymentAttemptVersion!
        : 1;
    const versionMeta = { [HOLD_PAYMENT_ATTEMPT_VERSION_META]: String(holdPaymentAttemptVersion) };
    const metadata: Record<string, string> = {
      holdId: input.holdId,
      slotId: hold.slotId,
      rateId: hold.rateId,
      ...versionMeta,
    };
    if (hold.experienceId) metadata.experienceId = hold.experienceId;
    if (hold.boatId) metadata.boatId = hold.boatId;
    const paymentIntentMetadata: Record<string, string> = {
      holdId: input.holdId,
      slotId: hold.slotId,
      rateId: hold.rateId,
      ...versionMeta,
      ...(hold.experienceId && { experienceId: hold.experienceId }),
      ...(hold.boatId && { boatId: hold.boatId }),
    };
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      payment_intent_data: { metadata: paymentIntentMetadata },
      customer_email:
        hold.customerDraft.email === "checkout@pending.local" ? undefined : hold.customerDraft.email,
      metadata,
    };
    const receiptClaimToken = signReceiptClaimToken(input.holdId);
    if (input.embedded) {
      (sessionParams as { ui_mode?: string }).ui_mode = "custom";
      sessionParams.return_url =
        baseUrl +
        "/booking/success?session_id={CHECKOUT_SESSION_ID}&receipt_token=" +
        encodeURIComponent(receiptClaimToken ?? "");
    } else {
      const holdExpiresAt = (hold.expiresAt as { toDate(): Date }).toDate();
      const releaseToken = signReleaseToken(input.holdId, Math.floor(holdExpiresAt.getTime() / 1000));
      sessionParams.success_url =
        baseUrl +
        "/booking/success?session_id={CHECKOUT_SESSION_ID}&receipt_token=" +
        encodeURIComponent(receiptClaimToken ?? "");
      sessionParams.cancel_url = releaseToken
        ? baseUrl + "/booking/cancel?holdId=" + encodeURIComponent(input.holdId) + "&release_token=" + encodeURIComponent(releaseToken)
        : baseUrl + "/booking/cancel?holdId=" + encodeURIComponent(input.holdId);
      sessionParams.custom_fields = [
        { key: "special_notes", label: { type: "custom", custom: "Special requests (optional)" }, type: "text" },
      ];
    }
    if (stripeCouponId) {
      sessionParams.discounts = [{ coupon: stripeCouponId }];
    }

    const checkoutSessionMode = input.embedded ? ("embedded" as const) : ("redirect" as const);
    const lockResult = await acquireCheckoutSessionCreationLock(db, holdRef, Timestamp, checkoutSessionMode);
    if (lockResult.kind === "hold_inactive") {
      return NextResponse.json({ error: "Hold expired or already used" }, { status: 400 });
    }
    if (lockResult.kind === "conflict") {
      return NextResponse.json(
        { error: "Checkout session is being created; please retry in a moment." },
        { status: 409 }
      );
    }
    if (lockResult.kind === "use_existing") {
      try {
        const existingSession = await stripe.checkout.sessions.retrieve(lockResult.checkoutSessionId);
        if (existingSession.status === "open") {
          const isEmbeddedSession = !!(existingSession.client_secret && (existingSession as { ui_mode?: string }).ui_mode === "custom");
          const isRedirectSession = !!existingSession.url;
          const wantEmbedded = input.embedded;
          if (wantEmbedded && isEmbeddedSession && existingSession.client_secret) {
            return NextResponse.json({ clientSecret: existingSession.client_secret, sessionId: existingSession.id });
          }
          if (!wantEmbedded && isRedirectSession && existingSession.url) {
            return NextResponse.json({ url: existingSession.url, sessionId: existingSession.id });
          }
        }
      } catch (e) {
        bookingError("create-checkout-session", "use_existing retrieve failed", e, { checkoutSessionId: lockResult.checkoutSessionId });
      }
      return NextResponse.json(
        { error: "Checkout session is being created; please retry in a moment." },
        { status: 409 }
      );
    }

    if (lockResult.kind === "proceed") {
      const holdFreshSnap = await holdRef.get();
      const holdFresh = holdFreshSnap.exists ? (holdFreshSnap.data() as Hold) : hold;
      const existingSessionIdFresh = (holdFresh as { checkoutSessionId?: string }).checkoutSessionId?.trim();
      if (existingSessionIdFresh) {
        try {
          const existingSession = await stripe.checkout.sessions.retrieve(existingSessionIdFresh);
          if (existingSession.status === "open") {
            const holdDiscountEarly = (holdFresh as { discountCents?: number }).discountCents ?? 0;
            const tipEarly = (holdFresh as { tipCents?: number }).tipCents ?? 0;
            const pricingEarly = holdFresh.pricing as { totalCents?: number } | undefined;
            const pricingTotalEarly =
              pricingEarly && typeof pricingEarly.totalCents === "number" ? pricingEarly.totalCents : null;
            const expectedPerHoldTotalCentsEarly =
              pricingTotalEarly != null ? pricingTotalEarly + tipEarly - holdDiscountEarly : null;
            const amountTotalEarly = existingSession.amount_total;
            const sessionAmountMismatch =
              expectedPerHoldTotalCentsEarly != null &&
              typeof amountTotalEarly === "number" &&
              Math.abs(amountTotalEarly - expectedPerHoldTotalCentsEarly) > 1;
            if (sessionAmountMismatch) {
              await stripe.checkout.sessions.expire(existingSessionIdFresh);
              bookingWarn("create-checkout-session", "Checkout session amount mismatch vs hold; expired and will create new session", {
                existingSessionId: existingSessionIdFresh,
                amountTotal: amountTotalEarly,
                expectedPerHoldTotalCents: expectedPerHoldTotalCentsEarly,
              });
            } else {
              const isEmbeddedSession = !!(existingSession.client_secret && (existingSession as { ui_mode?: string }).ui_mode === "custom");
              const isRedirectSession = !!existingSession.url;
              const wantEmbedded = input.embedded;
              if (wantEmbedded && isEmbeddedSession && existingSession.client_secret) {
                await clearSessionCreationInflight(holdRef, FieldValue);
                return NextResponse.json({ clientSecret: existingSession.client_secret, sessionId: existingSession.id });
              }
              if (!wantEmbedded && isRedirectSession && existingSession.url) {
                await clearSessionCreationInflight(holdRef, FieldValue);
                return NextResponse.json({ url: existingSession.url, sessionId: existingSession.id });
              }
              await stripe.checkout.sessions.expire(existingSessionIdFresh);
              console.warn("[create-checkout-session] Mode mismatch; expired existing session", {
                existingSessionId: existingSessionIdFresh,
                wantEmbedded,
              });
            }
          }
        } catch (sessionErr) {
          bookingError("create-checkout-session", "Failed to retrieve existing session after lock, creating new one", sessionErr, {
            existingSessionId: existingSessionIdFresh,
          });
        }
      }
    }

    let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
    try {
      session = await stripe.checkout.sessions.create(sessionParams, {
        idempotencyKey: "cs-" + input.holdId + (input.embedded ? "-emb" : "-redir"),
      });
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
      await clearSessionCreationInflight(holdRef, FieldValue);
      await rollbackCheckoutSession(db, input.holdId, hold, { FieldValue, Timestamp });
      return NextResponse.json(
        { error: stripeErrorToUserMessage(details) },
        { status: 500 }
      );
    }
    const holdUpdate: Record<string, unknown> = { checkoutSessionId: session.id, checkoutSessionMode };
    if (stripeCouponId && !holdStripeCouponId) holdUpdate.stripeCouponId = stripeCouponId;
    const paymentIntentIdFromSession =
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
    if (paymentIntentIdFromSession) {
      holdUpdate.fullPaymentIntentId = paymentIntentIdFromSession;
    } else {
      try {
        const expanded = await stripe.checkout.sessions.retrieve(session.id, { expand: ["payment_intent"] });
        const piId = typeof expanded.payment_intent === "object" && expanded.payment_intent?.id
          ? expanded.payment_intent.id
          : typeof expanded.payment_intent === "string"
            ? expanded.payment_intent
            : null;
        if (piId) holdUpdate.fullPaymentIntentId = piId;
      } catch (retrieveErr) {
        bookingError("create-checkout-session", "Could not persist payment intent on hold (retrieve expanded session failed)", retrieveErr, {
          holdId: input.holdId,
          sessionId: session.id,
        });
      }
    }
    const persistResult = await persistCheckoutSessionOnHoldWithRetry(
      db,
      holdRef,
      input.holdId,
      session.id,
      holdUpdate,
      { FieldValue, Timestamp },
      stripe
    );
    if (persistResult.ok === false && persistResult.reason === "lost_race") {
      return NextResponse.json(
        { error: "Checkout session is being created; please retry in a moment." },
        { status: 409 }
      );
    }
    if (persistResult.ok === false && persistResult.reason === "hold_inactive") {
      return NextResponse.json({ error: "Hold expired or already used" }, { status: 400 });
    }
    const piIdForMeta =
      (typeof holdUpdate.fullPaymentIntentId === "string" ? holdUpdate.fullPaymentIntentId : null) ??
      (typeof paymentIntentIdFromSession === "string" ? paymentIntentIdFromSession : null);
    if (piIdForMeta) {
      try {
        const piExisting = await stripe.paymentIntents.retrieve(piIdForMeta);
        await stripe.paymentIntents.update(piIdForMeta, {
          metadata: { ...piExisting.metadata, checkoutSessionId: session.id },
        });
      } catch (metaErr) {
        bookingError("create-checkout-session", "Could not attach checkoutSessionId to PaymentIntent metadata", metaErr, {
          holdId: input.holdId,
          sessionId: session.id,
          paymentIntentIdPrefix: piIdForMeta.slice(0, 12),
        });
      }
    }
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
