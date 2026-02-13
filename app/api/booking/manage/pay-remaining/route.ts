/**
 * POST /api/booking/manage/pay-remaining
 * Body: { token }. Creates on-session PaymentIntent for final amount; returns client_secret.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { verifyManageToken } from "@/lib/booking/manageToken";
import type { Booking } from "@/lib/booking/types";

function parseBody(body: unknown): { token: string } | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const token = typeof o.token === "string" ? o.token.trim() : null;
  return token ? { token } : null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const input = parseBody(body);
    if (!input) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }
    const payload = verifyManageToken(input.token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
    }
    const db = getDb();
    const bookingSnap = await db.collection("bookings").doc(payload.bookingId).get();
    if (!bookingSnap.exists) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    const booking = bookingSnap.data() as Booking;
    const customerId = booking.stripe?.customerId;
    const finalCents = booking.stripe?.finalAmountCents ?? 0;
    if (!customerId) {
      return NextResponse.json({ error: "No customer on booking" }, { status: 400 });
    }
    if (finalCents <= 0) {
      return NextResponse.json({ error: "No remaining balance to pay" }, { status: 400 });
    }
    const status = booking.status;
    if (status !== "final_due" && status !== "final_failed" && status !== "final_requires_action") {
      return NextResponse.json({ error: "Booking is not in a state that allows paying remaining balance" }, { status: 400 });
    }
    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: finalCents,
      currency: "usd",
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      metadata: { bookingId: payload.bookingId, payment_stage: "final" },
    });
    if (!paymentIntent.client_secret) {
      return NextResponse.json({ error: "PaymentIntent missing client secret" }, { status: 500 });
    }
    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      finalCents,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("MANAGE_BOOKING_SECRET")) {
      return NextResponse.json({ error: "Manage links are not configured" }, { status: 503 });
    }
    console.error("[manage/pay-remaining]", err);
    return NextResponse.json({ error: "Failed to create payment intent" }, { status: 500 });
  }
}
