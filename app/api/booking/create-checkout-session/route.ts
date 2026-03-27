/**
 * Creates a Stripe Checkout Session for a hold (embedded or redirect).
 * Requires `RELEASE_TOKEN_SECRET` (503 if unset). The client must send `release_token` from create-hold (proof of hold possession).
 * Do not log raw `holdId` in client-visible errors or third-party analytics.
 * Supports two modes:
 * (a) Embedded (ui_mode: "custom"): returns clientSecret for the Payment Element modal; return_url points to success page.
 * (b) Redirect/hosted: returns url for redirect to Stripe Hosted Checkout; success_url/cancel_url with release token.
 * For flows that need fine-grained deposit vs. full-payment control, prefer POST /api/booking/create-payment-intent.
 */
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe, buildLineItems, buildLineItemsFromHoldPricing, assertLiveAddonPricesMatchHoldSnapshot } from "@/lib/booking/stripe-client";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";
import { generateIncidentCode, bookingError, bookingWarn } from "@/lib/booking/debug";
import {
  acquireCheckoutSessionCreationLock,
  cleanupOrphanedCoupon,
  clearSessionCreationInflight,
  createStripeCheckoutSessionForHold,
  rollbackCheckoutSession,
} from "@/lib/booking/checkout-session-helpers";
import { resolveHoldBookingPricing } from "@/lib/booking/hold-charge-resolver";
import { bookingEnv } from "@/lib/booking/env";
import { signReleaseToken, verifyReleaseToken, hasReleaseTokenSecret } from "@/lib/booking/releaseToken";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { signReceiptClaimToken } from "@/lib/booking/receiptToken";
import { HOLD_PAYMENT_ATTEMPT_VERSION_META } from "@/lib/booking/constants";
import { buildCheckoutSessionIdempotencyKey } from "@/lib/booking/stripe-idempotency-keys";
import { HOLD_CHECKOUT_SESSION_EXTENSION_MINUTES, MAX_HOLD_LIFETIME_FROM_CREATED_MS } from "@/lib/booking/hold-expiry";
import type { Hold, Rate, ExperienceRate } from "@/lib/booking/types";
import { bookingNotReadyResponse, legacyFallbackUnsafeResponse } from "@/lib/booking/booking-readiness-response";
import { assertReceiptTokenSecretConfigured } from "@/lib/booking/receipt-token-secret";

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
    const notReady = bookingNotReadyResponse();
    if (notReady) return notReady;
    const legacyUnsafe = legacyFallbackUnsafeResponse();
    if (legacyUnsafe) return legacyUnsafe;
    try {
      assertReceiptTokenSecretConfigured();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      bookingError("create-checkout-session", "RECEIPT_TOKEN_SECRET missing in non-development — refusing checkout session", null, {
        nodeEnv: process.env.NODE_ENV ?? "",
        message: msg,
      });
      return NextResponse.json(
        {
          error:
            "Booking payments are temporarily unavailable (server configuration: RECEIPT_TOKEN_SECRET). Set the secret and redeploy.",
        },
        { status: 503 }
      );
    }
    const body = await request.json();
    const input = parseBody(body);
    if (!input) {
      return NextResponse.json({ error: "holdId required" }, { status: 400 });
    }
    if (!hasReleaseTokenSecret()) {
      bookingError("create-checkout-session", "RELEASE_TOKEN_SECRET is not set; refusing checkout session creation", null, {
        holdId: input.holdId,
        nodeEnv: process.env.NODE_ENV ?? "",
      });
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
          {
            error:
              "Booking payments are temporarily unavailable (server configuration: RELEASE_TOKEN_SECRET). Set the secret and redeploy.",
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        {
          error:
            "RELEASE_TOKEN_SECRET is required for checkout. Set it in your environment (e.g. .env.local for local development).",
        },
        { status: 503 }
      );
    }
    const db = getDb();
    const { Timestamp, FieldValue } = getFirestoreExports();
    const holdRef = db.collection("holds").doc(input.holdId);
    const holdSnap = await holdRef.get();
    if (!holdSnap.exists) {
      return NextResponse.json({ error: "Hold not found" }, { status: 404 });
    }
    const hold = holdSnap.data() as Hold;
    const holdAllowDeposit =
      typeof (hold as { allowDeposit?: boolean }).allowDeposit === "boolean"
        ? (hold as { allowDeposit?: boolean }).allowDeposit
        : false;
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
    if (hold.status !== "active") {
      return NextResponse.json({ error: "Hold expired or already used" }, { status: 400 });
    }
    const expiresAt = hold.expiresAt as { toDate(): Date };
    if (expiresAt.toDate() < new Date()) {
      return NextResponse.json({ error: "Hold expired" }, { status: 400 });
    }

    /** Snapshot after auth + status/expiry guards: true only while the hold is active and unexpired (before any Stripe calls). Passed to rollback helpers so we skip destructive rollback if the hold became inactive mid-flight. */
    const holdWasActiveAtRequestStart =
      hold.status === "active" && expiresAt.toDate() >= new Date();

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
    let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
    if (useSnapshotLineItems) {
      const fromHold = buildLineItemsFromHoldPricing({
        pricing,
        rate: rateForPricing as Rate | ExperienceRate,
        hold,
        ticketQty: ticketQtyForLineItems,
        holdIdForLog: input.holdId,
      });
      if (fromHold == null) {
        const liveCheck = assertLiveAddonPricesMatchHoldSnapshot(hold, addonsForPricing);
        if (!liveCheck.ok) {
          await clearSessionCreationInflight(holdRef, FieldValue);
          await writeOperationalAlert({
            type: "checkout_addon_snapshot_live_price_mismatch",
            holdId: input.holdId,
            addonId: liveCheck.addonId,
            snapshotCents: liveCheck.snapshotCents,
            liveCents: liveCheck.liveCents,
            source: "create-checkout-session",
          });
          return NextResponse.json(
            { error: "Checkout is temporarily unavailable. Please try again." },
            { status: 500 }
          );
        }
      }
      lineItems =
        fromHold ??
        buildLineItems({
          pricing,
          rate: rateForPricing as Rate | ExperienceRate,
          addons: addonsForPricing,
          hold,
          ticketQty: ticketQtyForLineItems,
          unitPriceCents: unitPriceCentsForLineItems,
        });
    } else {
      lineItems = buildLineItems({
        pricing,
        rate: rateForPricing as Rate | ExperienceRate,
        addons: addonsForPricing,
        hold,
        ticketQty: ticketQtyForLineItems,
        unitPriceCents: unitPriceCentsForLineItems,
      });
    }
    const holdDiscountCode = (hold as { discountCode?: string }).discountCode;
    const holdDiscountCents = (hold as { discountCents?: number }).discountCents ?? 0;
    const tipCentsSanity = (hold as { tipCents?: number }).tipCents ?? 0;
    const lineItemSumCents = lineItems.reduce((acc, li) => {
      const u = li.price_data?.unit_amount;
      const q = typeof li.quantity === "number" && Number.isFinite(li.quantity) ? li.quantity : 1;
      return acc + (typeof u === "number" && Number.isFinite(u) ? u * q : 0);
    }, 0);
    // Compare line items to pre-discount total: the Stripe coupon (session `discounts`) applies the discount, not a negative line.
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
    const holdPaymentAttemptVersion =
      typeof (hold as { paymentAttemptVersion?: number }).paymentAttemptVersion === "number"
        ? (hold as { paymentAttemptVersion?: number }).paymentAttemptVersion!
        : 1;
    /** Bumped in Firestore when an open Checkout Session is expired due to amount mismatch so Stripe idempotency keys differ on recreate. */
    let stripePaymentAttemptVersion = holdPaymentAttemptVersion;
    const holdStripeCouponId = (hold as { stripeCouponId?: string }).stripeCouponId;
    let stripeCouponId: string | undefined = holdStripeCouponId;
    const baseUrl = bookingEnv.appBaseUrl;
    const versionMeta = { [HOLD_PAYMENT_ATTEMPT_VERSION_META]: String(holdPaymentAttemptVersion) };
    const metadata: Record<string, string> = {
      holdId: input.holdId,
      slotId: hold.slotId,
      rateId: hold.rateId,
      allowDepositAtHold: holdAllowDeposit ? "true" : "false",
      ...versionMeta,
    };
    if (hold.experienceId) metadata.experienceId = hold.experienceId;
    if (hold.boatId) metadata.boatId = hold.boatId;
    const paymentIntentMetadata: Record<string, string> = {
      holdId: input.holdId,
      slotId: hold.slotId,
      rateId: hold.rateId,
      payment_stage: "full",
      totalCents: String(Math.max(0, expectedPerHoldTotalCents)),
      ...versionMeta,
      ...(hold.experienceId && { experienceId: hold.experienceId }),
      ...(hold.boatId && { boatId: hold.boatId }),
    };
    if (!paymentIntentMetadata.payment_stage || paymentIntentMetadata.payment_stage.trim().length === 0) {
      bookingError(
        "create-checkout-session",
        "PaymentIntent metadata invariant failed: payment_stage must be set before creating Checkout Session",
        null,
        { holdId: input.holdId }
      );
      return NextResponse.json(
        { error: "Checkout is temporarily unavailable. Please try again." },
        { status: 500 }
      );
    }
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
        ? `${baseUrl}/booking/cancel?holdId=${encodeURIComponent(input.holdId)}&release_token=${encodeURIComponent(releaseToken)}`
        : `${baseUrl}/booking/cancel?holdId=${encodeURIComponent(input.holdId)}`;
      sessionParams.custom_fields = [
        { key: "special_notes", label: { type: "custom", custom: "Special requests (optional)" }, type: "text" },
      ];
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
      const holdSnapForExtend = lockResult.holdSnap;
      const holdForExtend = holdSnapForExtend.exists ? (holdSnapForExtend.data() as Hold) : hold;
      const createdAtTs = holdForExtend.createdAt as unknown as { toMillis?: () => number } | undefined;
      if (createdAtTs && typeof createdAtTs.toMillis === "function") {
        const currentExp = (holdForExtend.expiresAt as { toDate(): Date }).toDate();
        const capAt = new Date(createdAtTs.toMillis() + MAX_HOLD_LIFETIME_FROM_CREATED_MS);
        const proposed = new Date(Date.now() + HOLD_CHECKOUT_SESSION_EXTENSION_MINUTES * 60 * 1000);
        const newExp = proposed.getTime() > capAt.getTime() ? capAt : proposed;
        if (newExp.getTime() > currentExp.getTime()) {
          await holdRef.update({
            expiresAt: Timestamp.fromDate(newExp),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        const urlExpiry = newExp.getTime() > currentExp.getTime() ? newExp : currentExp;
        if (!input.embedded) {
          const releaseTokenExtended = signReleaseToken(input.holdId, Math.floor(urlExpiry.getTime() / 1000));
          sessionParams.success_url =
            baseUrl +
            "/booking/success?session_id={CHECKOUT_SESSION_ID}&receipt_token=" +
            encodeURIComponent(receiptClaimToken ?? "");
          sessionParams.cancel_url = releaseTokenExtended
            ? `${baseUrl}/booking/cancel?holdId=${encodeURIComponent(input.holdId)}&release_token=${encodeURIComponent(releaseTokenExtended)}`
            : `${baseUrl}/booking/cancel?holdId=${encodeURIComponent(input.holdId)}`;
        }
      }
      const holdFreshSnap = lockResult.holdSnap;
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
              await holdRef.update({
                paymentAttemptVersion: FieldValue.increment(1),
                updatedAt: FieldValue.serverTimestamp(),
              });
              stripePaymentAttemptVersion = stripePaymentAttemptVersion + 1;
              const versionStr = String(stripePaymentAttemptVersion);
              if (sessionParams.metadata) sessionParams.metadata[HOLD_PAYMENT_ATTEMPT_VERSION_META] = versionStr;
              const pid = sessionParams.payment_intent_data as { metadata?: Record<string, string> } | undefined;
              if (pid?.metadata) pid.metadata[HOLD_PAYMENT_ATTEMPT_VERSION_META] = versionStr;
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
      // Stripe requires `discounts` at `sessions.create`; coupon is placed after lock + fresh hold read.
      // Orphan cleanup on failure skips bumping `paymentAttemptVersion` when persist fails with `hold_inactive`.
      if (holdDiscountCents > 0 && !stripeCouponId) {
        const coupon = await stripe.coupons.create(
          {
            amount_off: holdDiscountCents,
            currency: pricing.currency ?? "usd",
            name: `Discount${holdDiscountCode ? ` (${holdDiscountCode})` : ""}`,
            duration: "once",
          },
          { idempotencyKey: `coupon-cs-${input.holdId}-v${stripePaymentAttemptVersion}` }
        );
        stripeCouponId = coupon.id;
      }
      if (stripeCouponId) {
        sessionParams.discounts = [{ coupon: stripeCouponId }];
      }
    }

    const holdUpdateBase: Record<string, unknown> = { checkoutSessionMode };
    if (stripeCouponId && !holdStripeCouponId) holdUpdateBase.stripeCouponId = stripeCouponId;
    const created = await createStripeCheckoutSessionForHold(
      stripe,
      db,
      holdRef,
      input.holdId,
      sessionParams,
      buildCheckoutSessionIdempotencyKey({
        holdId: input.holdId,
        embedded: input.embedded === true,
        holdPaymentAttemptVersion: stripePaymentAttemptVersion,
      }),
      holdUpdateBase,
      { FieldValue, Timestamp }
    );
    if (!created.ok) {
      if (stripeCouponId && !holdStripeCouponId) {
        const persistHoldInactive =
          created.kind === "persist_failed" && created.persistReason === "hold_inactive";
        await cleanupOrphanedCoupon(stripe, stripeCouponId, holdRef, FieldValue, {
          skipHoldPaymentAttemptBump: persistHoldInactive,
        });
      }
      if (created.kind === "stripe_create_failed") {
        const e = created.stripeError;
        const details = formatStripeError(e);
        console.error("[create-checkout-session] Stripe create session failed:", details);
        await clearSessionCreationInflight(holdRef, FieldValue);
        if (holdWasActiveAtRequestStart) {
          const rb = await rollbackCheckoutSession(db, input.holdId, hold, { FieldValue, Timestamp });
          if (!rb.ok) {
            await writeOperationalAlert({
              type: "rollback_checkout_session_failed",
              holdId: input.holdId,
              source: "create-checkout-session",
              error: rb.error instanceof Error ? rb.error.message : String(rb.error),
            });
          }
        }
        return NextResponse.json(
          { error: stripeErrorToUserMessage(details) },
          { status: 500 }
        );
      }
      if (created.kind === "persist_failed") {
        if (created.persistReason === "lost_race") {
          return NextResponse.json(
            { error: "Checkout session is being created; please retry in a moment." },
            { status: 409 }
          );
        }
        if (created.persistReason === "hold_inactive") {
          return NextResponse.json({ error: "Hold expired or already used" }, { status: 400 });
        }
        if (holdWasActiveAtRequestStart) {
          const rb = await rollbackCheckoutSession(db, input.holdId, hold, { FieldValue, Timestamp });
          if (!rb.ok) {
            await writeOperationalAlert({
              type: "rollback_checkout_session_failed",
              holdId: input.holdId,
              source: "create-checkout-session",
              error: rb.error instanceof Error ? rb.error.message : String(rb.error),
            });
          }
        }
      }
      await clearSessionCreationInflight(holdRef, FieldValue);
      return NextResponse.json(
        { error: "Checkout is temporarily unavailable. Please try again." },
        { status: 500 }
      );
    }
    const session = created.session;
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
