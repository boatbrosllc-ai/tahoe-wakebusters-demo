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
import { convertHoldToBooking, type ConvertHoldInput, type ConvertHoldInputDeposit } from "@/lib/booking/convert-hold-to-booking";
import { signReceiptToken } from "@/lib/booking/receiptToken";
import type { BookingCardDisplay } from "@/lib/booking/types";
import { bookingLog, bookingWarn, bookingError } from "@/lib/booking/debug";

function parseBody(body: unknown): { holdId: string | null; paymentIntentId: string } | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const holdId = typeof o.holdId === "string" ? o.holdId : null;
  const paymentIntentId = typeof o.paymentIntentId === "string" ? o.paymentIntentId : null;
  if (!paymentIntentId) return null;
  return { holdId, paymentIntentId };
}

export async function POST(request: NextRequest) {
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
        return NextResponse.json(
          { processing: true, message: "Payment is processing. Your booking will be confirmed shortly." },
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

    const paymentStage = (pi.metadata?.payment_stage ?? "") as string;
    const customerId = typeof pi.customer === "string" ? pi.customer : pi.customer?.id;
    const pm = pi.payment_method as { id?: string; card?: { brand?: string; last4?: string; exp_month?: number; exp_year?: number } } | null;
    let card: BookingCardDisplay | undefined;
    if (pm?.card) {
      card = { brand: pm.card.brand, last4: pm.card.last4, expMonth: pm.card.exp_month, expYear: pm.card.exp_year };
    }
    const totalCentsFromMeta = parseInt(pi.metadata?.totalCents ?? "0", 10) || 0;
    const amountCharged = pi.amount ?? 0;
    const depositCentsFromMeta = parseInt(pi.metadata?.depositCents ?? "0", 10) || 0;
    // Treat as deposit when: metadata says "deposit", or amount charged is less than full total (fallback for missing metadata)
    const isDepositByStage = paymentStage === "deposit";
    const db = getDb();
    const holdRef = db.collection("holds").doc(holdId);
    const holdSnap = await holdRef.get();
    const hold = holdSnap.exists ? (holdSnap.data() as { pricing?: { totalCents?: number }; tipCents?: number; discountCents?: number }) : null;
    // When metadata total is missing/0, use hold pricing so we don't treat deposit amount as full total (which would make remaining = 0)
    let totalCents: number;
    if (totalCentsFromMeta > 0) {
      totalCents = totalCentsFromMeta;
    } else if (hold?.pricing && typeof hold.pricing.totalCents === "number") {
      const tipCents = typeof hold.tipCents === "number" ? hold.tipCents : 0;
      const discountCents = typeof hold.discountCents === "number" ? hold.discountCents : 0;
      totalCents = Math.max(0, hold.pricing.totalCents + tipCents - discountCents);
      bookingLog("complete-after-payment", "using hold pricing for total (metadata total missing)", { totalCents, amountCharged });
    } else {
      totalCents = amountCharged;
    }
    const depositCents = depositCentsFromMeta || (isDepositByStage ? amountCharged : totalCents);
    const finalCentsFromMeta = parseInt(pi.metadata?.finalCents ?? "0", 10) || 0;
    const finalCents = finalCentsFromMeta > 0 ? finalCentsFromMeta : Math.max(0, totalCents - amountCharged);
    const isDepositByAmount = totalCents > 0 && amountCharged > 0 && amountCharged < totalCents;
    // Decide deposit vs full from metadata and amount; do NOT require customerId so we never show "full payment" for a deposit
    const useDepositInput = isDepositByStage || (paymentStage !== "full" && paymentStage !== "final" && isDepositByAmount);
    bookingLog("complete-after-payment", "PI metadata and convert decision", {
      holdId,
      paymentStage: paymentStage ?? null,
      totalCentsFromMeta,
      totalCents,
      amountCharged,
      depositCentsFromMeta,
      finalCents,
      isDepositByStage,
      isDepositByAmount,
      useDepositInput,
    });

    const convertInput: ConvertHoldInput =
      useDepositInput
        ? ({
            paymentStage: "deposit",
            paymentIntentId: pi.id,
            amountTotalCents: amountCharged,
            currency: pi.currency ?? undefined,
            stripe: {
              ...(customerId && { customerId }),
              ...(pm?.id && { paymentMethodId: pm.id }),
              ...(card && { card }),
              totalCents,
              depositCents: amountCharged,
              finalCents: Math.max(0, totalCents - amountCharged),
            },
          } as ConvertHoldInputDeposit)
        : {
            paymentIntentId: pi.id,
            amountTotalCents: pi.amount ?? undefined,
            currency: pi.currency ?? undefined,
          };

    const paymentSummaryForClient = {
      isDeposit: useDepositInput,
      depositCents: useDepositInput ? amountCharged : totalCents,
      totalCents,
      finalCents: useDepositInput ? Math.max(0, totalCents - amountCharged) : 0,
    };
    bookingLog("complete-after-payment", "calling convertHoldToBooking", {
      holdId: input.holdId,
      paymentStage: useDepositInput ? "deposit" : "full",
    });
    const result = await convertHoldToBooking(db, holdId, convertInput);

    if ("alreadyConverted" in result) {
      bookingLog("complete-after-payment", "hold already converted (idempotent)", { holdId });
      let bookingId: string | undefined;
      try {
        const byFull = await db.collection("bookings").where("stripe.paymentIntentId", "==", input.paymentIntentId).limit(1).get();
        if (!byFull.empty) {
          bookingId = byFull.docs[0].id;
        } else {
          const byDeposit = await db.collection("bookings").where("stripe.depositPaymentIntentId", "==", input.paymentIntentId).limit(1).get();
          if (!byDeposit.empty) bookingId = byDeposit.docs[0].id;
        }
      } catch (lookupErr) {
        bookingWarn("complete-after-payment", "alreadyConverted: booking lookup failed (non-fatal)", { holdId, err: lookupErr });
      }
      let receiptToken: string | undefined;
      if (bookingId) {
        try {
          receiptToken = signReceiptToken(bookingId);
        } catch (tokenErr) {
          bookingWarn("complete-after-payment", "receipt token failed (non-fatal)", { bookingId, err: tokenErr });
        }
      }
      return NextResponse.json({
        success: true,
        alreadyConverted: true,
        ...(bookingId ? { bookingId } : {}),
        ...(receiptToken ? { receiptToken } : {}),
        paymentSummary: paymentSummaryForClient,
      });
    }
    bookingLog("complete-after-payment", "booking created", { bookingId: result.bookingId, holdId });
    let receiptToken: string | undefined;
    try {
      receiptToken = signReceiptToken(result.bookingId);
    } catch (tokenErr) {
      bookingWarn("complete-after-payment", "receipt token failed (non-fatal)", { bookingId: result.bookingId, err: tokenErr });
    }
    return NextResponse.json({
      success: true,
      bookingId: result.bookingId,
      ...(receiptToken ? { receiptToken } : {}),
      ...(result.discountLimitExceeded && { discountLimitExceeded: true }),
      paymentSummary: paymentSummaryForClient,
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
      return NextResponse.json(
        { error: "Your booking hold has expired. Please start a new booking.", holdExpired: true },
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
