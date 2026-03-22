/**
 * Called by the client immediately after Stripe confirmPayment succeeds.
 * Creates the booking in Firestore and sends the confirmation email.
 * This ensures the booking exists even if the Stripe webhook is delayed or misconfigured.
 * Idempotent: if the hold was already converted (e.g. by webhook), returns success.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";
import {
  convertHoldToBooking,
  isConvertHoldInputDeposit,
  type ConvertHoldInput,
  type ConvertHoldInputDeposit,
} from "@/lib/booking/convert-hold-to-booking";
import {
  buildConvertHoldInputFromSucceededPaymentIntent,
  paymentIntentMatchesHoldForConversion,
} from "@/lib/booking/stripe-payment-intent-convert";
import { signReceiptClaimToken } from "@/lib/booking/receiptToken";
import { bookingLog, bookingWarn, bookingError } from "@/lib/booking/debug";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { upsertPendingRefundRecord } from "@/lib/booking/pending-refund-idempotent";
import type { Booking, Hold } from "@/lib/booking/types";
import type Stripe from "stripe";
import type { Firestore } from "firebase-admin/firestore";

function parseBody(body: unknown): { holdId: string | null; paymentIntentId: string } | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const holdId = typeof o.holdId === "string" ? o.holdId : null;
  const paymentIntentId = typeof o.paymentIntentId === "string" ? o.paymentIntentId : null;
  if (!paymentIntentId) return null;
  return { holdId, paymentIntentId };
}

async function resolveBookingIdFromPaymentSignals(
  db: Firestore,
  paymentIntentId: string,
  pi: Stripe.PaymentIntent
): Promise<string | null> {
  const byFull = await db.collection("bookings").where("stripe.paymentIntentId", "==", paymentIntentId).limit(1).get();
  if (!byFull.empty) return byFull.docs[0].id;
  const byDep = await db.collection("bookings").where("stripe.depositPaymentIntentId", "==", paymentIntentId).limit(1).get();
  if (!byDep.empty) return byDep.docs[0].id;
  const checkoutMeta =
    typeof pi.metadata?.checkoutSessionId === "string"
      ? pi.metadata.checkoutSessionId
      : typeof pi.metadata?.checkout_session_id === "string"
        ? pi.metadata.checkout_session_id
        : undefined;
  if (checkoutMeta) {
    const byCs = await db.collection("bookings").where("stripe.checkoutSessionId", "==", checkoutMeta).limit(1).get();
    if (!byCs.empty) {
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
    const rl = await checkRateLimit(getClientKey(request));
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
    const stripe = getStripe();
    let pi = await stripe.paymentIntents.retrieve(input.paymentIntentId, { expand: ["payment_method"] });
    const metadataHoldId = pi.metadata?.holdId as string | undefined;
    const holdId = input.holdId ?? metadataHoldId ?? null;
    if (!holdId) {
      bookingLog("complete-after-payment", "no holdId in body or PI metadata");
      return NextResponse.json({ error: "Payment intent has no associated hold" }, { status: 400 });
    }
    bookingLog("complete-after-payment", "parsed input", {
      holdId,
      paymentIntentIdPrefix: input.paymentIntentId.slice(0, 24) + "...",
    });
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
        return NextResponse.json(
          {
            processing: true,
            message: "Payment is processing. Your booking will be confirmed shortly.",
            pollHardTimeoutMs: 300_000,
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
    const piMetadataHoldId = pi.metadata?.holdId;
    if (piMetadataHoldId !== holdId) {
      bookingError("complete-after-payment", "holdId mismatch", null, {
        metadataHoldId: piMetadataHoldId ?? null,
        inputHoldId: holdId,
      });
      return NextResponse.json(
        { error: "Payment intent does not match this hold" },
        { status: 400 }
      );
    }

    const db = getDb();
    const holdRef = db.collection("holds").doc(holdId);
    const holdSnap = await holdRef.get();
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
        return NextResponse.json({
          success: true,
          alreadyConverted: true,
          bookingId: recoveredBookingId,
          ...(receiptClaimToken ? { receiptClaimToken } : {}),
          paymentSummary: paymentSummaryRecovered,
          ...(recoveredExp ? { experienceId: recoveredExp } : {}),
        });
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
    const holdStripeIds = holdSnap.data() as {
      depositPaymentIntentId?: string;
      fullPaymentIntentId?: string;
      paymentAttemptVersion?: number;
      pricing?: { totalCents?: number };
      tipCents?: number;
      discountCents?: number;
    };
    const holdForPricing = holdSnap.data() as {
      pricing?: { totalCents?: number };
      tipCents?: number;
      discountCents?: number;
    };
    const convertInput: ConvertHoldInput = buildConvertHoldInputFromSucceededPaymentIntent(pi, holdForPricing);
    const useDepositInput = isConvertHoldInputDeposit(convertInput);
    const amountCharged = pi.amount ?? 0;
    const totalCents = useDepositInput
      ? (convertInput as ConvertHoldInputDeposit).stripe.totalCents
      : (() => {
          const fromMeta = parseInt(pi.metadata?.totalCents ?? "0", 10) || 0;
          if (fromMeta > 0) return fromMeta;
          if (holdForPricing?.pricing && typeof holdForPricing.pricing.totalCents === "number") {
            const tipCents = typeof holdForPricing.tipCents === "number" ? holdForPricing.tipCents : 0;
            const discountCents =
              typeof holdForPricing.discountCents === "number" ? holdForPricing.discountCents : 0;
            return Math.max(0, holdForPricing.pricing.totalCents + tipCents - discountCents);
          }
          return amountCharged;
        })();
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
      finalCents: useDepositInput ? Math.max(0, totalCents - amountCharged) : 0,
    };

    const piMatchesHold = paymentIntentMatchesHoldForConversion(pi, holdStripeIds, holdForPricing).ok;
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
        return NextResponse.json({
          success: true,
          alreadyConverted: true,
          bookingId: recoveredBookingId,
          ...(receiptClaimToken ? { receiptClaimToken } : {}),
          paymentSummary: paymentSummaryForClient,
          ...(recoveredExp ? { experienceId: recoveredExp } : {}),
        });
      }
      bookingError("complete-after-payment", "payment intent not recorded on hold", null, {
        holdId,
        paymentIntentIdPrefix: input.paymentIntentId.slice(0, 24),
      });
      try {
        const holdRow = holdSnap.data() as Hold;
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
      return NextResponse.json(
        {
          success: false,
          reconciliationPending: true,
          bookingConfirmed: false,
          amountMismatch: true,
          message:
            "We are confirming your payment. If you do not receive a confirmation email within 15 minutes, please contact us.",
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
      return NextResponse.json({
        success: true,
        alreadyConverted: true,
        bookingId: resolvedBookingId,
        ...(receiptClaimToken ? { receiptClaimToken } : {}),
        paymentSummary: paymentSummaryForClient,
        ...(holdExperienceId ? { experienceId: holdExperienceId } : {}),
      });
    }
    bookingLog("complete-after-payment", "booking created", { bookingId: result.bookingId, holdId });
    const receiptClaimToken = signReceiptClaimToken(holdId) ?? undefined;
    if (!receiptClaimToken) {
      bookingWarn("complete-after-payment", "receipt claim token unavailable (receipt signing secret not set)", {
        bookingId: result.bookingId,
        holdId,
      });
    }
    return NextResponse.json({
      success: true,
      bookingId: result.bookingId,
      ...(receiptClaimToken ? { receiptClaimToken } : {}),
      paymentSummary: paymentSummaryForClient,
      ...(holdExperienceId ? { experienceId: holdExperienceId } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to complete booking";
    // Log full error and stack for debugging (server logs / Netlify)
    const stack = err instanceof Error ? err.stack : undefined;
    bookingError("complete-after-payment", "complete after payment failed", err, { message, stack: stack ? stack.slice(0, 500) : undefined });
    if (process.env.NODE_ENV === "development" && stack) {
      console.error("[booking:complete-after-payment] stack:", stack);
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
    if (message.startsWith("DISCOUNT_LIMIT_REACHED:")) {
      const userMessage = message.slice("DISCOUNT_LIMIT_REACHED:".length).trim();
      return NextResponse.json(
        { error: userMessage },
        { status: 400 }
      );
    }
    // Don't expose env/config errors to the client; return generic message and log real error
    const isConfigError =
      /missing required env|firebase config|FIREBASE_|STRIPE_|BREVO_|config missing/i.test(message) ||
      (err instanceof Error && (message.includes("private key") || message.includes("PEM")));
    const clientMessage = isConfigError
      ? "Server configuration error. Please try again or contact support."
      : message;
    return NextResponse.json({ error: clientMessage }, { status: 500 });
  }
}
