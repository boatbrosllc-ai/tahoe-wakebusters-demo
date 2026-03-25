/**
 * Called by the client immediately after Stripe confirmPayment succeeds.
 * Creates the booking in Firestore and sends the confirmation email.
 * This ensures the booking exists even if the Stripe webhook is delayed or misconfigured.
 * Idempotent: if the hold was already converted (e.g. by webhook), returns success.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { checkRateLimitPostPayment, getClientKey, getHoldRateLimitKey } from "@/lib/booking/rate-limit";
import { bookingNotReadyResponse, legacyFallbackUnsafeResponse } from "@/lib/booking/booking-readiness-response";
import { assertReceiptTokenSecretConfigured } from "@/lib/booking/receipt-token-secret";
import {
  convertHoldToBooking,
  isBookingBlockedByOperatorError,
  isConvertHoldInputDeposit,
  type ConvertHoldInput,
  type ConvertHoldInputDeposit,
} from "@/lib/booking/convert-hold-to-booking";
import { BlockCheckUnavailableError } from "@/lib/booking/has-overlapping-block";
import {
  buildConvertHoldInputFromSucceededPaymentIntent,
  paymentIntentMatchesHoldForConversion,
} from "@/lib/booking/stripe-payment-intent-convert";
import { signReceiptClaimToken, verifyReceiptClaimToken } from "@/lib/booking/receiptToken";
import { bookingLog, bookingWarn, bookingError } from "@/lib/booking/debug";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { computeFinalChargeTotalCentsFromHoldPricing } from "@/lib/booking/hold-pricing-final-total";
import type { BookingPricing } from "@/lib/booking/types";
import { upsertPendingRefundRecord } from "@/lib/booking/pending-refund-idempotent";
import type { Booking, Experience, Hold } from "@/lib/booking/types";
import type Stripe from "stripe";
import type { Firestore } from "firebase-admin/firestore";
import {
  sendAmountIntegrityMismatchCustomerEmail,
  sendAmountIntegrityMismatchOpsEmail,
} from "@/lib/booking/brevo";
import { verifyIndexedStripeCustomerOrClear } from "@/lib/booking/stripe-customer-index";

const PI_MISMATCH_DELAY_MS = 80;
const PI_MISMATCH_RETRY_ATTEMPTS = 3;
const PI_MISMATCH_RETRY_DELAY_MS = 500;

/** Firestore propagation: empty PI fields on hold while PI succeeded — re-read before returning 202. */
const PROPAGATION_LAG_RETRY_ATTEMPTS = 5;
const PROPAGATION_LAG_RETRY_DELAY_MS = 1500;

async function propagationLagDelayMs(zeroBasedStep: number): Promise<void> {
  const base = PROPAGATION_LAG_RETRY_DELAY_MS * 2 ** zeroBasedStep;
  const capped = Math.min(10_000, base);
  await new Promise((r) => setTimeout(r, capped));
}

async function hasDiscountLimitExceededPendingRefund(db: Firestore, bookingId: string): Promise<boolean> {
  const snap = await db
    .collection("pendingRefunds")
    .where("bookingId", "==", bookingId)
    .where("reason", "==", "discount_limit_exceeded")
    .limit(1)
    .get();
  return !snap.empty;
}

async function loadDegradedConfirmationPayload(
  db: Firestore,
  bookingId: string
): Promise<{
  bookingId: string;
  startDateStr?: string;
} | null> {
  const snap = await db.collection("bookings").doc(bookingId).get();
  if (!snap.exists) return null;
  const booking = snap.data() as Booking;
  return {
    bookingId,
    startDateStr: booking.startDateStr,
  };
}

async function appendReceiptSuccessExtras(
  db: Firestore,
  bookingId: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const hasToken =
    (typeof payload.receiptClaimToken === "string" && payload.receiptClaimToken.length > 0) ||
    (typeof payload.receiptToken === "string" && payload.receiptToken.length > 0);
  const [discountFlag, degraded] = await Promise.all([
    hasDiscountLimitExceededPendingRefund(db, bookingId),
    !hasToken ? loadDegradedConfirmationPayload(db, bookingId) : Promise.resolve(null),
  ]);
  return {
    ...payload,
    ...(discountFlag ? { discountLimitExceeded: true } : {}),
    ...(degraded && !hasToken ? { degradedConfirmation: degraded } : {}),
  };
}

function stripeCustomerIdFromPaymentIntent(pi: Stripe.PaymentIntent): string | null {
  const c = pi.customer;
  if (typeof c === "string" && c.trim()) return c.trim();
  if (c && typeof c === "object" && "id" in c && typeof (c as Stripe.Customer).id === "string") {
    return (c as Stripe.Customer).id;
  }
  return null;
}

function parseBody(body: unknown): {
  holdId: string | null;
  paymentIntentId: string;
  receiptClaimToken: string | null;
} | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const holdId = typeof o.holdId === "string" ? o.holdId : null;
  const paymentIntentId = typeof o.paymentIntentId === "string" ? o.paymentIntentId : null;
  if (!paymentIntentId) return null;
  const rawClaim =
    typeof o.receipt_claim_token === "string"
      ? o.receipt_claim_token
      : typeof o.receiptToken === "string"
        ? o.receiptToken
        : null;
  const receiptClaimToken = rawClaim != null && rawClaim.trim() ? rawClaim.trim() : null;
  return { holdId, paymentIntentId, receiptClaimToken };
}

async function resolveBookingIdFromPaymentSignals(
  db: Firestore,
  paymentIntentId: string,
  pi: Stripe.PaymentIntent
): Promise<string | null> {
  const checkoutMeta =
    typeof pi.metadata?.checkoutSessionId === "string"
      ? pi.metadata.checkoutSessionId
      : typeof pi.metadata?.checkout_session_id === "string"
        ? pi.metadata.checkout_session_id
        : undefined;

  const qFull = db.collection("bookings").where("stripe.paymentIntentId", "==", paymentIntentId).limit(1).get();
  const qDep = db.collection("bookings").where("stripe.depositPaymentIntentId", "==", paymentIntentId).limit(1).get();
  const qCs = checkoutMeta
    ? db.collection("bookings").where("stripe.checkoutSessionId", "==", checkoutMeta).limit(1).get()
    : Promise.resolve(null as import("firebase-admin/firestore").QuerySnapshot | null);

  const [rFull, rDep, rCs] = await Promise.allSettled([qFull, qDep, qCs]);

  const snapFull = rFull.status === "fulfilled" ? rFull.value : null;
  if (rFull.status === "rejected") {
    bookingWarn("complete-after-payment", "reconcile query failed (paymentIntentId)", { err: rFull.reason });
  }
  if (snapFull && !snapFull.empty) return snapFull.docs[0].id;

  const snapDep = rDep.status === "fulfilled" ? rDep.value : null;
  if (rDep.status === "rejected") {
    bookingWarn("complete-after-payment", "reconcile query failed (depositPaymentIntentId)", { err: rDep.reason });
  }
  if (snapDep && !snapDep.empty) return snapDep.docs[0].id;

  const byCs = rCs.status === "fulfilled" ? rCs.value : null;
  if (rCs.status === "rejected") {
    bookingWarn("complete-after-payment", "reconcile query failed (checkoutSessionId)", { err: rCs.reason });
  }
  if (checkoutMeta && byCs && !byCs.empty) {
    const doc = byCs.docs[0];
    const b = doc.data() as Booking;
    const s = b.stripe;
    if (
      s?.paymentIntentId === paymentIntentId ||
      s?.depositPaymentIntentId === paymentIntentId ||
      s?.checkoutSessionId === checkoutMeta
    ) {
      return doc.id;
    }
  }
  return null;
}

async function resolveBookingIdAfterConversion(
  db: Firestore,
  holdBookingId: string | undefined,
  holdId: string,
  paymentIntentId: string,
  pi: Stripe.PaymentIntent
): Promise<string | null> {
  if (holdBookingId) {
    const snap = await db.collection("bookings").doc(holdBookingId).get();
    if (snap.exists) return holdBookingId;
    bookingWarn("complete-after-payment", "hold.bookingId points to missing booking document", { holdId, holdBookingId });
  }
  return resolveBookingIdFromPaymentSignals(db, paymentIntentId, pi);
}

export async function POST(request: NextRequest) {
  let holdIdForAlert: string | null = null;
  let paymentIntentIdForAlert: string | null = null;
  try {
    const notReady = bookingNotReadyResponse();
    if (notReady) return notReady;
    const legacyUnsafe = legacyFallbackUnsafeResponse();
    if (legacyUnsafe) return legacyUnsafe;
    try {
      assertReceiptTokenSecretConfigured();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      bookingError("complete-after-payment", "RECEIPT_TOKEN_SECRET missing in non-development — refusing post-payment completion", null, {
        nodeEnv: process.env.NODE_ENV ?? "",
        message: msg,
      });
      return NextResponse.json(
        {
          error:
            "Booking confirmations are temporarily unavailable (server configuration: RECEIPT_TOKEN_SECRET). Please try again shortly.",
        },
        { status: 503 }
      );
    }
    const rl = await checkRateLimitPostPayment(getClientKey(request));
    if (!rl.allowed) {
      if (rl.serverError) {
        return NextResponse.json(
          { error: "Rate limit service temporarily unavailable. Please try again shortly." },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rl.retryAfterMs != null ? { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } : undefined }
      );
    }
    bookingLog("complete-after-payment", "request started");
    const body = await request.json();
    const input = parseBody(body);
    if (!input) {
      bookingLog("complete-after-payment", "invalid body: paymentIntentId required");
      return NextResponse.json({ error: "paymentIntentId required" }, { status: 400 });
    }
    /**
     * Idempotent conversion is also driven by Stripe `payment_intent.succeeded` → webhook when configured;
     * this route is the client fast path when the webhook is delayed or misconfigured.
     */
    const stripe = getStripe();
    let pi = await stripe.paymentIntents.retrieve(input.paymentIntentId, { expand: ["payment_method"] });

    let holdId: string;
    if (input.receiptClaimToken) {
      const claimPayload = verifyReceiptClaimToken(input.receiptClaimToken);
      if (!claimPayload) {
        bookingLog("complete-after-payment", "invalid or expired receipt_claim_token");
        return NextResponse.json({ error: "Invalid or expired receipt claim token" }, { status: 401 });
      }
      holdId = claimPayload.holdId;
      if (input.holdId && input.holdId.trim() !== holdId) {
        return NextResponse.json({ error: "receipt_claim_token does not match holdId" }, { status: 400 });
      }
      const metadataHoldId = pi.metadata?.holdId as string | undefined;
      if (metadataHoldId != null && metadataHoldId !== holdId) {
        bookingLog("complete-after-payment", "PI metadata holdId does not match receipt claim");
        return NextResponse.json({ error: "Payment intent does not match this hold" }, { status: 400 });
      }
    } else {
      const metaHold = typeof pi.metadata?.holdId === "string" ? pi.metadata.holdId.trim() : "";
      if (!metaHold) {
        bookingLog("complete-after-payment", "PI missing holdId metadata and no receipt_claim_token — reconciliation pending");
        return NextResponse.json(
          {
            reconciliationPending: true,
            message:
              "Your payment was received. We are confirming your booking; you will receive a confirmation email shortly.",
          },
          { status: 200 }
        );
      }
      if (input.holdId?.trim() && input.holdId.trim() !== metaHold) {
        return NextResponse.json({ error: "holdId does not match this payment" }, { status: 400 });
      }
      holdId = metaHold;
    }
    bookingLog("complete-after-payment", "parsed input", {
      holdId,
      paymentIntentIdPrefix: input.paymentIntentId.slice(0, 24) + "...",
    });
    const rlHold = await checkRateLimitPostPayment(getHoldRateLimitKey(holdId));
    if (!rlHold.allowed) {
      if (rlHold.serverError) {
        return NextResponse.json(
          { error: "Rate limit service temporarily unavailable. Please try again shortly." },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rlHold.retryAfterMs != null ? { "Retry-After": String(Math.ceil(rlHold.retryAfterMs / 1000)) } : undefined }
      );
    }
    bookingLog("complete-after-payment", "PaymentIntent retrieved", {
      holdId,
      piStatus: pi.status,
      piId: pi.id,
    });
    if (pi.status !== "succeeded") {
      if (pi.status === "processing") {
        bookingLog("complete-after-payment", "payment still processing, returning 202", { holdId });
        const pmType =
          typeof pi.payment_method === "object" && pi.payment_method && "type" in pi.payment_method
            ? (pi.payment_method as { type?: string }).type
            : undefined;
        const asyncPmTypes = new Set(["us_bank_account", "acss_debit", "customer_balance", "sepa_debit"]);
        const isSyncForPolling = pmType == null ? true : !asyncPmTypes.has(pmType);
        const pollHardTimeoutMs = isSyncForPolling ? 30_000 : 300_000;
        return NextResponse.json(
          {
            processing: true,
            message: "Payment is processing. Your booking will be confirmed shortly.",
            pollHardTimeoutMs,
            ...(pmType ? { paymentMethodType: pmType } : {}),
          },
          { status: 202 }
        );
      }
      bookingLog("complete-after-payment", "payment not succeeded", { holdId, status: pi.status });
      return NextResponse.json(
        { error: "Payment has not succeeded yet. Your booking will be created shortly—check your email and Admin." },
        { status: 400 }
      );
    }
    const piMetadataHoldIdAfterSuccess = pi.metadata?.holdId;
    if (piMetadataHoldIdAfterSuccess != null && piMetadataHoldIdAfterSuccess !== holdId) {
      bookingError("complete-after-payment", "holdId mismatch", null, {
        metadataHoldId: piMetadataHoldIdAfterSuccess ?? null,
        inputHoldId: holdId,
      });
      return NextResponse.json(
        { error: "Payment intent does not match this hold" },
        { status: 400 }
      );
    }

    const db = getDb();
    const holdRef = db.collection("holds").doc(holdId);
    let holdSnap = await holdRef.get();
    if (!holdSnap.exists) {
      bookingWarn("complete-after-payment", "hold not found; reconciling by payment intent / checkout session", {
        holdId,
        paymentIntentIdPrefix: input.paymentIntentId.slice(0, 12),
      });
      let recoveredBookingId: string | null = null;
      try {
        recoveredBookingId = await resolveBookingIdFromPaymentSignals(db, input.paymentIntentId, pi);
      } catch (reconErr) {
        bookingWarn("complete-after-payment", "hold-missing booking reconciliation query failed", { holdId, err: reconErr });
      }
      if (recoveredBookingId) {
        const bSnap = await db.collection("bookings").doc(recoveredBookingId).get();
        const holdIdForToken =
          bSnap.exists && typeof (bSnap.data() as Booking).holdId === "string"
            ? ((bSnap.data() as Booking).holdId as string)
            : holdId;
        const receiptClaimToken = signReceiptClaimToken(holdIdForToken) ?? undefined;
        if (!receiptClaimToken) {
          bookingWarn("complete-after-payment", "receipt claim token unavailable after hold-missing recovery", {
            holdId,
            recoveredBookingId,
          });
        }
        bookingLog("complete-after-payment", "booking recovered without hold document", { holdId, recoveredBookingId });
        const ciRecover = buildConvertHoldInputFromSucceededPaymentIntent(pi, null);
        const useDepRecover = isConvertHoldInputDeposit(ciRecover);
        const amtRecover = pi.amount ?? 0;
        const totRecover = useDepRecover
          ? (ciRecover as ConvertHoldInputDeposit).stripe.totalCents
          : (() => {
              const fromMeta = parseInt(pi.metadata?.totalCents ?? "0", 10) || 0;
              return fromMeta > 0 ? fromMeta : amtRecover;
            })();
        const paymentSummaryRecovered = {
          isDeposit: useDepRecover,
          depositCents: useDepRecover ? amtRecover : totRecover,
          totalCents: totRecover,
          finalCents: useDepRecover ? Math.max(0, totRecover - amtRecover) : 0,
        };
        const recoveredExp =
          bSnap.exists && typeof (bSnap.data() as Booking).experienceId === "string"
            ? (bSnap.data() as Booking).experienceId
            : undefined;
        return NextResponse.json(
          await appendReceiptSuccessExtras(db, recoveredBookingId, {
            success: true,
            alreadyConverted: true,
            bookingId: recoveredBookingId,
            ...(receiptClaimToken ? { receiptClaimToken } : {}),
            paymentSummary: paymentSummaryRecovered,
            ...(recoveredExp ? { experienceId: recoveredExp } : {}),
          })
        );
      }
      await writeOperationalAlert({
        type: "complete_after_payment_hold_missing_no_booking",
        holdId,
        paymentIntentId: input.paymentIntentId,
        source: "complete-after-payment",
      });
      return NextResponse.json(
        {
          success: false,
          reconciliationPending: true,
          holdNotFound: true,
          bookingConfirmed: false,
          message:
            "We could not match this payment to an active reservation. Our team has been notified—please contact us with your email and payment details.",
        },
        { status: 200 }
      );
    }
    const holdExperienceId =
      typeof (holdSnap.data() as Hold).experienceId === "string"
        ? (holdSnap.data() as Hold).experienceId!.trim()
        : undefined;
    let holdRow = holdSnap.data() as Hold & {
      stripe?: { customerId?: string };
    };
    let holdStripeIds = holdRow as {
      depositPaymentIntentId?: string;
      fullPaymentIntentId?: string;
      paymentAttemptVersion?: number;
      pricing?: { totalCents?: number };
      tipCents?: number;
      discountCents?: number;
    };
    let holdForPricing = holdSnap.data() as {
      pricing?: { totalCents?: number };
      tipCents?: number;
      discountCents?: number;
    };
    let piMatchesHold = paymentIntentMatchesHoldForConversion(pi, holdStripeIds, holdForPricing).ok;
    if (!piMatchesHold) {
      const holdVerEarly = typeof holdStripeIds.paymentAttemptVersion === "number" ? holdStripeIds.paymentAttemptVersion : 0;
      /** Version bumped: empty PI fields on hold, or PI ids present but stale vs this PaymentIntent — do not block; client polls. */
      const likelyPropagationLagEarly = holdVerEarly >= 1;
      if (likelyPropagationLagEarly) {
        for (let lagAttempt = 0; lagAttempt < PROPAGATION_LAG_RETRY_ATTEMPTS && !piMatchesHold; lagAttempt++) {
          if (lagAttempt > 0) {
            await propagationLagDelayMs(lagAttempt - 1);
          }
          const lagSnap = await holdRef.get();
          if (!lagSnap.exists) break;
          holdSnap = lagSnap;
          holdRow = holdSnap.data() as Hold & { stripe?: { customerId?: string } };
          holdStripeIds = holdRow as typeof holdStripeIds;
          holdForPricing = holdSnap.data() as typeof holdForPricing;
          piMatchesHold = paymentIntentMatchesHoldForConversion(pi, holdStripeIds, holdForPricing).ok;
        }
        if (!piMatchesHold) {
          bookingLog("complete-after-payment", "returning 202 — hold paymentAttemptVersion>=1 and PI not matched after server retries", {
            holdId,
          });
          await writeOperationalAlert({
            type: "complete_after_payment_pi_mismatch_likely_hold_read_lag",
            holdId,
            paymentIntentId: input.paymentIntentId,
            holdPaymentAttemptVersion: holdVerEarly,
            source: "complete-after-payment",
          });
          return NextResponse.json(
            {
              processing: true,
              message: "Payment is being confirmed. Your booking will be finalized shortly.",
              pollHardTimeoutMs: 30_000,
            },
            { status: 202 }
          );
        }
      }
      for (let attempt = 0; attempt < PI_MISMATCH_RETRY_ATTEMPTS - 1 && !piMatchesHold; attempt++) {
        await new Promise((r) => setTimeout(r, PI_MISMATCH_RETRY_DELAY_MS));
        const snapRetry = await holdRef.get();
        if (!snapRetry.exists) break;
        holdSnap = snapRetry;
        holdRow = holdSnap.data() as Hold & { stripe?: { customerId?: string } };
        holdStripeIds = holdRow as typeof holdStripeIds;
        holdForPricing = holdSnap.data() as typeof holdForPricing;
        piMatchesHold = paymentIntentMatchesHoldForConversion(pi, holdStripeIds, holdForPricing).ok;
      }
    }
    let holdCustomerId = typeof holdRow.stripe?.customerId === "string" ? holdRow.stripe.customerId.trim() : "";
    if (!holdCustomerId && holdRow.customerDraft?.email) {
      const emailKey = holdRow.customerDraft.email.trim().toLowerCase();
      if (emailKey) {
        try {
          const idxRef = db.collection("stripeCustomerIndex").doc(emailKey);
          const idxSnap = await idxRef.get();
          const cid = idxSnap.exists ? (idxSnap.data() as { customerId?: string | null })?.customerId : undefined;
          if (typeof cid === "string" && cid.trim()) {
            const verified = await verifyIndexedStripeCustomerOrClear(
              getStripe(),
              idxRef,
              emailKey,
              cid,
              "complete-after-payment"
            );
            if (verified) holdCustomerId = verified;
          }
        } catch {
          /* non-fatal */
        }
      }
    }
    const piCustomerId = stripeCustomerIdFromPaymentIntent(pi);
    if (holdCustomerId && piCustomerId && holdCustomerId !== piCustomerId) {
      bookingError("complete-after-payment", "payment intent customer does not match hold", null, {
        holdId,
        holdCustomerIdPrefix: holdCustomerId.slice(0, 8),
        piCustomerIdPrefix: piCustomerId.slice(0, 8),
      });
      await new Promise((r) => setTimeout(r, PI_MISMATCH_DELAY_MS));
      return NextResponse.json({ error: "Payment intent does not match this reservation" }, { status: 400 });
    }
    const convertInput: ConvertHoldInput = buildConvertHoldInputFromSucceededPaymentIntent(pi, holdForPricing);
    const useDepositInput = isConvertHoldInputDeposit(convertInput);
    const amountCharged = pi.amount ?? 0;
    let totalCents: number;
    if (useDepositInput) {
      const depStripe = (convertInput as ConvertHoldInputDeposit).stripe;
      const fromConvert = depStripe.totalCents;
      const fromMeta = parseInt(pi.metadata?.totalCents ?? "0", 10) || 0;
      if (typeof fromConvert === "number" && fromConvert > 0) {
        totalCents = fromConvert;
      } else if (fromMeta > 0) {
        totalCents = fromMeta;
      } else if (holdForPricing?.pricing && typeof holdForPricing.pricing.totalCents === "number") {
        const tipCents = typeof holdForPricing.tipCents === "number" ? holdForPricing.tipCents : 0;
        const discountCents =
          typeof holdForPricing.discountCents === "number" ? holdForPricing.discountCents : 0;
        totalCents = computeFinalChargeTotalCentsFromHoldPricing(
          holdForPricing.pricing as BookingPricing,
          tipCents,
          discountCents
        );
      } else {
        totalCents = 0;
        bookingWarn("complete-after-payment", "deposit flow: totalCents unresolved (no convert total, metadata, or hold pricing)", {
          holdId,
          paymentIntentIdPrefix: input.paymentIntentId.slice(0, 12),
        });
      }
    } else {
      const fromMeta = parseInt(pi.metadata?.totalCents ?? "0", 10) || 0;
      if (fromMeta > 0) totalCents = fromMeta;
      else if (holdForPricing?.pricing && typeof holdForPricing.pricing.totalCents === "number") {
        const tipCents = typeof holdForPricing.tipCents === "number" ? holdForPricing.tipCents : 0;
        const discountCents =
          typeof holdForPricing.discountCents === "number" ? holdForPricing.discountCents : 0;
        totalCents = computeFinalChargeTotalCentsFromHoldPricing(
          holdForPricing.pricing as BookingPricing,
          tipCents,
          discountCents
        );
      } else totalCents = amountCharged;
    }
    const finalCentsComputed = useDepositInput ? Math.max(0, totalCents - amountCharged) : 0;
    if (useDepositInput && totalCents > 0 && finalCentsComputed === 0) {
      bookingWarn("complete-after-payment", "deposit flow: finalCents would be zero while totalCents > 0 — check PI metadata and hold pricing", {
        holdId,
        totalCents,
        amountCharged,
      });
    }
    bookingLog("complete-after-payment", "PI metadata and convert decision", {
      holdId,
      paymentStage: (pi.metadata?.payment_stage ?? null) as string | null,
      totalCents,
      amountCharged,
      useDepositInput,
    });

    const paymentSummaryForClient = {
      isDeposit: useDepositInput,
      depositCents: useDepositInput ? amountCharged : totalCents,
      totalCents,
      finalCents: finalCentsComputed,
    };

    if (!piMatchesHold) {
      let recoveredBookingId: string | null = null;
      try {
        recoveredBookingId = await resolveBookingIdFromPaymentSignals(db, input.paymentIntentId, pi);
      } catch (lookupErr) {
        bookingWarn("complete-after-payment", "secondary booking lookup failed", { holdId, err: lookupErr });
      }
      if (recoveredBookingId) {
        bookingLog("complete-after-payment", "recovered booking via PI/checkoutSessionId (hold missing PI id)", {
          holdId,
          recoveredBookingId,
        });
        const receiptClaimToken = signReceiptClaimToken(holdId) ?? undefined;
        if (!receiptClaimToken) {
          bookingWarn("complete-after-payment", "receipt claim token unavailable after recovery lookup", { holdId, recoveredBookingId });
        }
        const bSnapRec = await db.collection("bookings").doc(recoveredBookingId).get();
        const recoveredExp =
          bSnapRec.exists && typeof (bSnapRec.data() as Booking).experienceId === "string"
            ? (bSnapRec.data() as Booking).experienceId
            : undefined;
        return NextResponse.json(
          await appendReceiptSuccessExtras(db, recoveredBookingId, {
            success: true,
            alreadyConverted: true,
            bookingId: recoveredBookingId,
            ...(receiptClaimToken ? { receiptClaimToken } : {}),
            paymentSummary: paymentSummaryForClient,
            ...(recoveredExp ? { experienceId: recoveredExp } : {}),
          })
        );
      }
      bookingError("complete-after-payment", "payment intent not recorded on hold", null, {
        holdId,
        paymentIntentIdPrefix: input.paymentIntentId.slice(0, 24),
      });
      await new Promise((r) => setTimeout(r, PI_MISMATCH_DELAY_MS));
      const holdRow = holdSnap.data() as Hold;
      try {
        await upsertPendingRefundRecord(
          db,
          {
            reason: "pi_mismatch_in_complete_after_payment",
            holdId,
            paymentIntentId: input.paymentIntentId,
          },
          {
            holdId,
            paymentIntentId: input.paymentIntentId,
            holdDepositPaymentIntentId: holdStripeIds.depositPaymentIntentId ?? null,
            holdFullPaymentIntentId: holdStripeIds.fullPaymentIntentId ?? null,
            ...(holdRow.customerDraft?.email && { customerEmail: holdRow.customerDraft.email }),
            // Always require manual review before auto-refund (webhook may still create the booking).
            requiresReview: true,
          }
        );
      } catch (prErr) {
        console.error("[complete-after-payment] pendingRefunds pi mismatch", prErr);
      }
      return NextResponse.json(
        {
          success: false,
          reconciliationPending: true,
          bookingConfirmed: false,
          message:
            "We are confirming your payment. If you do not receive a confirmation email within 15 minutes, please contact us.",
        },
        { status: 200 }
      );
    }

    bookingLog("complete-after-payment", "calling convertHoldToBooking", {
      holdId: input.holdId,
      paymentStage: useDepositInput ? "deposit" : "full",
    });
    holdIdForAlert = holdId;
    paymentIntentIdForAlert = input.paymentIntentId;
    const result = await convertHoldToBooking(db, holdId, convertInput);

    if ("amountIntegrityMismatch" in result) {
      bookingWarn("complete-after-payment", "amount integrity mismatch — conversion blocked", { holdId });
      await writeOperationalAlert({
        type: "complete_after_payment_amount_integrity_mismatch",
        holdId,
        paymentIntentId: input.paymentIntentId,
        source: "complete-after-payment",
      });
      try {
        await sendAmountIntegrityMismatchOpsEmail({
          holdId,
          paymentIntentId: input.paymentIntentId,
          source: "complete-after-payment",
        });
      } catch (e) {
        console.error("[complete-after-payment] sendAmountIntegrityMismatchOpsEmail", e);
      }
      const holdData = holdSnap.data() as Hold;
      const custEmail = holdData.customerDraft?.email?.trim();
      if (custEmail) {
        try {
          await sendAmountIntegrityMismatchCustomerEmail({
            to: custEmail,
            customerName: holdData.customerDraft?.name?.trim() ?? "Guest",
            holdId,
          });
        } catch (e) {
          console.error("[complete-after-payment] sendAmountIntegrityMismatchCustomerEmail", e);
        }
      }
      return NextResponse.json(
        {
          success: false,
          reconciliationPending: true,
          bookingConfirmed: false,
          amountMismatch: true,
          message:
            "We received your payment. Your booking is under review — we will contact you within 2 hours with next steps. If you do not hear from us by then, please contact us.",
        },
        { status: 200 }
      );
    }

    if ("alreadyConverted" in result) {
      bookingLog("complete-after-payment", "hold already converted (idempotent)", { holdId });
      const holdRow = holdSnap.data() as Hold;
      let resolvedBookingId: string | null = null;
      try {
        resolvedBookingId = await resolveBookingIdAfterConversion(
          db,
          holdRow.bookingId,
          holdId,
          input.paymentIntentId,
          pi
        );
      } catch (lookupErr) {
        bookingWarn("complete-after-payment", "alreadyConverted: booking resolution failed", { holdId, err: lookupErr });
      }
      if (!resolvedBookingId) {
        bookingWarn("complete-after-payment", "alreadyConverted:no_resolvable_booking", {
          holdId,
          paymentIntentIdPrefix: input.paymentIntentId.slice(0, 12),
        });
        await writeOperationalAlert({
          type: "complete_after_payment_already_converted_no_booking",
          holdId,
          paymentIntentId: input.paymentIntentId,
          source: "complete-after-payment",
        });
        return NextResponse.json(
          {
            success: false,
            reconciliationPending: true,
            bookingConfirmed: false,
            message:
              "Your payment is recorded but we could not confirm your booking in our system yet. Please wait a few minutes for email confirmation, or contact us if nothing arrives.",
            paymentSummary: paymentSummaryForClient,
          },
          { status: 200 }
        );
      }
      const receiptClaimToken = signReceiptClaimToken(holdId) ?? undefined;
      if (!receiptClaimToken) {
        bookingWarn("complete-after-payment", "receipt claim token unavailable (receipt signing secret not set)", {
          bookingId: resolvedBookingId,
          holdId,
        });
      }
      holdIdForAlert = null;
      paymentIntentIdForAlert = null;
      return NextResponse.json(
        await appendReceiptSuccessExtras(db, resolvedBookingId, {
          success: true,
          alreadyConverted: true,
          bookingId: resolvedBookingId,
          ...(receiptClaimToken ? { receiptClaimToken } : {}),
          paymentSummary: paymentSummaryForClient,
          ...(holdExperienceId ? { experienceId: holdExperienceId } : {}),
        })
      );
    }
    bookingLog("complete-after-payment", "booking created", { bookingId: result.bookingId, holdId });
    const receiptClaimToken = signReceiptClaimToken(holdId) ?? undefined;
    if (!receiptClaimToken) {
      bookingWarn("complete-after-payment", "receipt claim token unavailable (receipt signing secret not set)", {
        bookingId: result.bookingId,
        holdId,
      });
    }
    holdIdForAlert = null;
    paymentIntentIdForAlert = null;
    return NextResponse.json(
      await appendReceiptSuccessExtras(db, result.bookingId, {
        success: true,
        bookingId: result.bookingId,
        ...(receiptClaimToken ? { receiptClaimToken } : {}),
        paymentSummary: paymentSummaryForClient,
        ...(holdExperienceId ? { experienceId: holdExperienceId } : {}),
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to complete booking";
    // Log full error and stack for debugging (server logs / Netlify)
    const stack = err instanceof Error ? err.stack : undefined;
    bookingError("complete-after-payment", "complete after payment failed", err, { message, stack: stack ? stack.slice(0, 500) : undefined });
    if (process.env.NODE_ENV === "development" && stack) {
      console.error("[booking:complete-after-payment] stack:", stack);
    }

    if (err instanceof BlockCheckUnavailableError) {
      return NextResponse.json(
        { error: "Unable to verify availability. Please try again shortly." },
        { status: 503 }
      );
    }

    if (isBookingBlockedByOperatorError(err)) {
      bookingWarn("complete-after-payment", "operator block overlap — conversion blocked", {
        holdId: holdIdForAlert,
      });
      try {
        if (holdIdForAlert && paymentIntentIdForAlert) {
          const dbAlert = getDb();
          let customerEmail: string | undefined;
          try {
            const hs = await dbAlert.collection("holds").doc(holdIdForAlert).get();
            if (hs.exists) {
              customerEmail = (hs.data() as Hold)?.customerDraft?.email;
            }
          } catch {
            /* non-fatal */
          }
          await upsertPendingRefundRecord(
            dbAlert,
            {
              reason: "operator_date_blocked_at_conversion",
              holdId: holdIdForAlert,
              paymentIntentId: paymentIntentIdForAlert,
            },
            {
              holdId: holdIdForAlert,
              paymentIntentId: paymentIntentIdForAlert,
              ...(customerEmail && { customerEmail }),
            }
          );
          await writeOperationalAlert({
            type: "complete_after_payment_operator_date_blocked",
            holdId: holdIdForAlert,
            paymentIntentId: paymentIntentIdForAlert,
            source: "complete-after-payment",
          });
        }
      } catch (opErr) {
        console.error("[complete-after-payment] operator block pendingRefunds/alert", opErr);
      }
      return NextResponse.json(
        {
          success: false,
          reconciliationPending: true,
          bookingConfirmed: false,
          message:
            "We received your payment. Your booking is under review — we will contact you within 2 hours with next steps. If you do not hear from us by then, please contact us.",
        },
        { status: 200 }
      );
    }

    if (message === "Hold has expired") {
      bookingWarn("complete-after-payment", "hold expired", { holdId: (err as { holdId?: string }).holdId });
      try {
        if (holdIdForAlert && paymentIntentIdForAlert) {
          const dbAlert = getDb();
          let customerEmail: string | undefined;
          try {
            const hs = await dbAlert.collection("holds").doc(holdIdForAlert).get();
            if (hs.exists) {
              customerEmail = (hs.data() as Hold)?.customerDraft?.email;
            }
          } catch {
            // non-fatal
          }
          try {
            await upsertPendingRefundRecord(
              dbAlert,
              {
                reason: "hold_expired_after_payment",
                holdId: holdIdForAlert,
                paymentIntentId: paymentIntentIdForAlert,
              },
              {
                holdId: holdIdForAlert,
                paymentIntentId: paymentIntentIdForAlert,
                ...(customerEmail && { customerEmail }),
              }
            );
          } catch (prErr) {
            console.error("[complete-after-payment] pendingRefunds hold expired after payment", prErr);
          }
          await writeOperationalAlert({
            type: "hold_expired_after_payment",
            holdId: holdIdForAlert,
            paymentIntentId: paymentIntentIdForAlert,
            source: "complete-after-payment",
          });
        }
      } catch {
        // non-fatal
      }
      return NextResponse.json(
        {
          error:
            "We've received your payment. If you do not receive a confirmation email within 15 minutes, please contact us.",
          holdExpired: true,
        },
        { status: 409 }
      );
    }
    const isConfigError =
      /missing required env|firebase config|FIREBASE_|STRIPE_|BREVO_|config missing/i.test(message) ||
      (err instanceof Error && (message.includes("private key") || message.includes("PEM")));
    if (isConfigError) {
      return NextResponse.json(
        { error: "Server configuration error. Please try again or contact support." },
        { status: 500 }
      );
    }
    if (message.startsWith("DISCOUNT_LIMIT_REACHED:")) {
      const userMessage = message.slice("DISCOUNT_LIMIT_REACHED:".length).trim();
      return NextResponse.json(
        { error: userMessage },
        { status: 400 }
      );
    }
    if (holdIdForAlert && paymentIntentIdForAlert) {
      const reconMessage =
        "We received your payment. Our team is reconciling your booking and will contact you shortly. If you do not hear from us within one business day, please reach out with your confirmation email.";
      try {
        const dbRecon = getDb();
        let customerEmail: string | undefined;
        try {
          const hs = await dbRecon.collection("holds").doc(holdIdForAlert).get();
          if (hs.exists) {
            customerEmail = (hs.data() as Hold)?.customerDraft?.email;
          }
        } catch {
          /* non-fatal */
        }
        await upsertPendingRefundRecord(
          dbRecon,
          {
            reason: "complete_after_payment_conversion_failed",
            holdId: holdIdForAlert,
            paymentIntentId: paymentIntentIdForAlert,
          },
          {
            holdId: holdIdForAlert,
            paymentIntentId: paymentIntentIdForAlert,
            convertError: message.slice(0, 500),
            ...(customerEmail && { customerEmail }),
          }
        );
        await writeOperationalAlert({
          type: "complete_after_payment_convert_failed",
          holdId: holdIdForAlert,
          paymentIntentId: paymentIntentIdForAlert,
          source: "complete-after-payment",
          error: message.slice(0, 500),
        });
      } catch (reconErr) {
        bookingWarn("complete-after-payment", "reconciliation path failed", { err: reconErr });
      }
      return NextResponse.json(
        {
          success: false,
          reconciliationPending: true,
          bookingConfirmed: false,
          message: reconMessage,
        },
        { status: 200 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
