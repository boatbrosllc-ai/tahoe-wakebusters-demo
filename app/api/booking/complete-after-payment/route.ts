/**
 * Called by the client immediately after Stripe confirmPayment succeeds.
 * Creates the booking in Firestore and sends the confirmation email.
 * This ensures the booking exists even if the Stripe webhook is delayed or misconfigured.
 * Idempotent: if the hold was already converted (e.g. by webhook), returns success.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { convertHoldToBooking, type ConvertHoldInput, type ConvertHoldInputDeposit } from "@/lib/booking/convert-hold-to-booking";
import type { BookingCardDisplay } from "@/lib/booking/types";

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
    const body = await request.json();
    const input = parseBody(body);
    if (!input) {
      console.error("[complete-after-payment] missing holdId or paymentIntentId in body");
      return NextResponse.json({ error: "holdId and paymentIntentId required" }, { status: 400 });
    }
    console.log("[complete-after-payment] request", { holdId: input.holdId, paymentIntentId: input.paymentIntentId?.slice(0, 20) + "..." });

    const stripe = getStripe();
    let pi = await stripe.paymentIntents.retrieve(input.paymentIntentId, { expand: ["payment_method"] });
    if (pi.status !== "succeeded") {
      if (pi.status === "processing") {
        await new Promise((r) => setTimeout(r, 2500));
        pi = await stripe.paymentIntents.retrieve(input.paymentIntentId, { expand: ["payment_method"] });
      }
      if (pi.status !== "succeeded") {
        console.error("[complete-after-payment] payment not succeeded", { status: pi.status });
        return NextResponse.json(
          { error: "Payment has not succeeded yet. Your booking will be created shortly—check your email and Admin." },
          { status: 400 }
        );
      }
    }
    const metadataHoldId = pi.metadata?.holdId;
    if (metadataHoldId !== input.holdId) {
      console.error("[complete-after-payment] holdId mismatch", { metadataHoldId, inputHoldId: input.holdId });
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
    const result = await convertHoldToBooking(db, input.holdId, convertInput);

    if ("alreadyConverted" in result) {
      console.log("[complete-after-payment] already converted", { holdId: input.holdId });
      return NextResponse.json({ success: true, alreadyConverted: true });
    }
    console.log("[complete-after-payment] booking created", { bookingId: result.bookingId, holdId: input.holdId });
    return NextResponse.json({ success: true, bookingId: result.bookingId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to complete booking";
    console.error("[complete-after-payment]", message, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
