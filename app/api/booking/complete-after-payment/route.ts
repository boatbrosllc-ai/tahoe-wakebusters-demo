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
import type { BookingCardDisplay } from "@/lib/booking/types";
import { bookingLog, bookingWarn, bookingError } from "@/lib/booking/debug";

function parseBody(body: unknown): { holdId: string; paymentIntentId: string } | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const holdId = typeof o.holdId === "string" ? o.holdId : null;
  const paymentIntentId = typeof o.paymentIntentId === "string" ? o.paymentIntentId : null;
  if (!holdId || !paymentIntentId) return null;
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
      bookingLog("complete-after-payment", "invalid body: holdId and paymentIntentId required");
      return NextResponse.json({ error: "holdId and paymentIntentId required" }, { status: 400 });
    }
    bookingLog("complete-after-payment", "parsed input", {
      holdId: input.holdId,
      paymentIntentIdPrefix: input.paymentIntentId?.slice(0, 24) + "...",
    });

    const stripe = getStripe();
    let pi = await stripe.paymentIntents.retrieve(input.paymentIntentId, { expand: ["payment_method"] });
    bookingLog("complete-after-payment", "PaymentIntent retrieved", {
      holdId: input.holdId,
      piStatus: pi.status,
      piId: pi.id,
    });
    if (pi.status !== "succeeded") {
      if (pi.status === "processing") {
        bookingLog("complete-after-payment", "payment still processing, returning 202", { holdId: input.holdId });
        return NextResponse.json(
          { processing: true, message: "Payment is processing. Your booking will be confirmed shortly." },
          { status: 202 }
        );
      }
      bookingLog("complete-after-payment", "payment not succeeded", { holdId: input.holdId, status: pi.status });
      return NextResponse.json(
        { error: "Payment has not succeeded yet. Your booking will be created shortly—check your email and Admin." },
        { status: 400 }
      );
    }
    const metadataHoldId = pi.metadata?.holdId;
    if (metadataHoldId !== input.holdId) {
      bookingError("complete-after-payment", "holdId mismatch", null, {
        metadataHoldId: metadataHoldId ?? null,
        inputHoldId: input.holdId,
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
    const totalCents = totalCentsFromMeta || (pi.amount ?? 0);
    const depositCentsFromMeta = parseInt(pi.metadata?.depositCents ?? "0", 10) || 0;
    const depositCents = depositCentsFromMeta || (pi.amount ?? 0);
    const finalCents = parseInt(pi.metadata?.finalCents ?? "0", 10) || Math.max(0, totalCents - depositCents);
    const amountCharged = pi.amount ?? 0;
    // Treat as deposit when: metadata says "deposit", or amount charged is less than full total (fallback for missing metadata)
    const isDepositByStage = paymentStage === "deposit";
    const isDepositByAmount = totalCentsFromMeta > 0 && amountCharged > 0 && amountCharged < totalCentsFromMeta;
    const useDepositInput = customerId && (isDepositByStage || (paymentStage !== "full" && paymentStage !== "final" && isDepositByAmount));
    bookingLog("complete-after-payment", "PI metadata and convert decision", {
      holdId: input.holdId,
      paymentStage: paymentStage ?? null,
      totalCentsFromMeta,
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
              customerId,
              paymentMethodId: pm?.id,
              card,
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

    const db = getDb();
    bookingLog("complete-after-payment", "calling convertHoldToBooking", {
      holdId: input.holdId,
      paymentStage: useDepositInput ? "deposit" : "full",
    });
    const result = await convertHoldToBooking(db, input.holdId, convertInput);

    if ("alreadyConverted" in result) {
      bookingLog("complete-after-payment", "hold already converted (idempotent)", { holdId: input.holdId });
      return NextResponse.json({ success: true, alreadyConverted: true });
    }
    bookingLog("complete-after-payment", "booking created", { bookingId: result.bookingId, holdId: input.holdId });
    return NextResponse.json({
      success: true,
      bookingId: result.bookingId,
      ...(result.discountLimitExceeded && { discountLimitExceeded: true }),
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
