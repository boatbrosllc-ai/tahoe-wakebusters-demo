/**
 * POST /api/booking/manage/pay-remaining
 * Body: { token }. Creates or reuses PaymentIntent for final amount; returns client_secret.
 * Idempotent: reuses existing in-flight intent when possible; deterministic idempotency key per booking.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { verifyManageToken } from "@/lib/booking/manageToken";
import type { Booking } from "@/lib/booking/types";

const ALLOWED_STATUSES = ["final_due", "final_failed", "final_requires_action", "final_processing"] as const;

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
    const { FieldValue } = getFirestoreExports();
    const bookingRef = db.collection("bookings").doc(payload.bookingId);
    const bookingSnap = await bookingRef.get();
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
    if (!ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
      return NextResponse.json({ error: "Booking is not in a state that allows paying remaining balance" }, { status: 400 });
    }

    type TxResult = { useExisting: boolean; existingPiId?: string };
    const txResult = await db.runTransaction(async (tx): Promise<TxResult> => {
      const snap = await tx.get(bookingRef);
      if (!snap.exists) throw new Error("Booking not found");
      const b = snap.data() as Booking;
      const currentStatus = b.status;
      const currentPiId = b.stripe?.finalPaymentIntentId;
      if (currentStatus === "final_paid") {
        throw new Error("Booking is already fully paid");
      }
      if (currentPiId && (currentStatus === "final_processing" || currentStatus === "final_due" || currentStatus === "final_failed" || currentStatus === "final_requires_action")) {
        return { useExisting: true, existingPiId: currentPiId };
      }
      if (!ALLOWED_STATUSES.includes(currentStatus as (typeof ALLOWED_STATUSES)[number])) {
        throw new Error("Booking is not in a state that allows paying remaining balance");
      }
      tx.update(bookingRef, {
        status: "final_processing",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { useExisting: false };
    });

    const stripe = getStripe();
    if (txResult.useExisting && txResult.existingPiId) {
      const pi = await stripe.paymentIntents.retrieve(txResult.existingPiId);
      if (pi.status === "succeeded") {
        return NextResponse.json({ error: "This booking is already fully paid" }, { status: 400 });
      }
      if (pi.status === "requires_payment_method" || pi.status === "requires_confirmation" || pi.status === "requires_action") {
        if (!pi.client_secret) {
          return NextResponse.json({ error: "PaymentIntent missing client secret" }, { status: 500 });
        }
        return NextResponse.json({
          clientSecret: pi.client_secret,
          paymentIntentId: pi.id,
          finalCents,
        });
      }
      if (pi.status === "canceled") {
        await bookingRef.update({
          status: "final_due",
          "stripe.finalPaymentIntentId": FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    const idempotencyKey = `final_${payload.bookingId}`;
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: finalCents,
        currency: "usd",
        customer: customerId,
        automatic_payment_methods: { enabled: true },
        metadata: { bookingId: payload.bookingId, payment_stage: "final" },
      },
      { idempotencyKey }
    );
    if (!paymentIntent.client_secret) {
      return NextResponse.json({ error: "PaymentIntent missing client secret" }, { status: 500 });
    }
    await bookingRef.update({
      "stripe.finalPaymentIntentId": paymentIntent.id,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      finalCents,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("MANAGE_BOOKING_SECRET")) {
      return NextResponse.json({ error: "Manage links are not configured" }, { status: 503 });
    }
    if (err instanceof Error && (err.message === "Booking not found" || err.message === "Booking is already fully paid" || err.message === "Booking is not in a state that allows paying remaining balance")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[manage/pay-remaining]", err);
    return NextResponse.json({ error: "Failed to create payment intent" }, { status: 500 });
  }
}
