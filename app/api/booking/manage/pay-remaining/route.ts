/**
 * POST /api/booking/manage/pay-remaining
 * Body: { token }. Creates or reuses PaymentIntent for final amount; returns client_secret.
 * Idempotent: reuses existing in-flight intent when possible; deterministic idempotency key per booking.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { verifyManageToken } from "@/lib/booking/manageToken";
import { getFinalChargeIdempotencyKey, isFinalChargeLockRecent } from "@/lib/booking/final-charge-idempotency";
import { checkRateLimit, getClientKey, getManageRateLimitKey } from "@/lib/booking/rate-limit";
import type { Booking } from "@/lib/booking/types";

const ALLOWED_STATUSES = ["final_due", "final_failed", "final_requires_action", "final_processing"] as const;

function getTokenFromRequest(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const t = auth.slice(7).trim();
    return t || null;
  }
  return null;
}

function parseBody(body: unknown): { token: string } | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const token = typeof o.token === "string" ? o.token.trim() : null;
  return token ? { token } : null;
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
    let token = getTokenFromRequest(request);
    if (!token) {
      const body = await request.json().catch(() => null);
      const input = parseBody(body);
      token = input?.token ?? null;
    }
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }
    const payload = verifyManageToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
    }
    const rlManage = await checkRateLimit(getManageRateLimitKey(payload.bookingId));
    if (!rlManage.allowed) {
      if (rlManage.serverError) {
        return NextResponse.json(
          { error: "Rate limit service temporarily unavailable. Please try again shortly." },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: rlManage.retryAfterMs != null ? { "Retry-After": String(Math.ceil(rlManage.retryAfterMs / 1000)) } : undefined }
      );
    }
    const db = getDb();
    const { FieldValue } = getFirestoreExports();
    const bookingRef = db.collection("bookings").doc(payload.bookingId);
    const bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    const booking = bookingSnap.data() as Booking;
    if (payload.email != null) {
      const bookingEmail = booking.customer?.email?.trim().toLowerCase();
      if (bookingEmail !== payload.email) {
        return NextResponse.json({ error: "This link is not valid for this booking" }, { status: 403 });
      }
    }
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

    const now = new Date();
    type TxResult = { useExisting: boolean; existingPiId?: string; lockInFlight?: boolean };
    const txResult = await db.runTransaction(async (tx): Promise<TxResult> => {
      const snap = await tx.get(bookingRef);
      if (!snap.exists) throw new Error("Booking not found");
      const b = snap.data() as Booking;
      const currentStatus = b.status;
      const currentPiId = b.stripe?.finalPaymentIntentId;
      const lockAt = b.stripe?.finalChargeLockAt;
      if (currentStatus === "final_paid") {
        throw new Error("Booking is already fully paid");
      }
      // Honor shared lock: cron or another path may be creating the intent; do not create a second one.
      if (isFinalChargeLockRecent(lockAt, now) && !currentPiId) {
        return { useExisting: false, lockInFlight: true };
      }
      // Reuse existing in-flight intent when present.
      if (currentPiId && (currentStatus === "final_processing" || currentStatus === "final_due" || currentStatus === "final_failed" || currentStatus === "final_requires_action")) {
        return { useExisting: true, existingPiId: currentPiId };
      }
      if (!ALLOWED_STATUSES.includes(currentStatus as (typeof ALLOWED_STATUSES)[number])) {
        throw new Error("Booking is not in a state that allows paying remaining balance");
      }
      return { useExisting: false };
    });

    if (txResult.lockInFlight) {
      return NextResponse.json(
        { error: "A final charge is in progress. Please wait a moment and try again." },
        { status: 409 }
      );
    }

    const stripe = getStripe();
    if (txResult.useExisting && txResult.existingPiId) {
      const pi = await stripe.paymentIntents.retrieve(txResult.existingPiId);
      if (pi.status === "succeeded") {
        return NextResponse.json({ error: "This booking is already fully paid" }, { status: 400 });
      }
      if (pi.status === "processing") {
        return NextResponse.json({
          status: "processing",
          message: "Your payment is still processing. Please wait a moment and refresh the page to check status.",
          paymentIntentId: pi.id,
          finalCents,
        });
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

    const idempotencyKey = getFinalChargeIdempotencyKey(payload.bookingId);
    let paymentIntent: Awaited<ReturnType<typeof stripe.paymentIntents.create>>;
    try {
      paymentIntent = await stripe.paymentIntents.create(
        {
          amount: finalCents,
          currency: "usd",
          customer: customerId,
          payment_method_types: ["card"],
          metadata: { bookingId: payload.bookingId, payment_stage: "final" },
        },
        { idempotencyKey }
      );
    } catch (createErr: unknown) {
      const stripeErr = createErr as { code?: string; type?: string; statusCode?: number };
      const isIdempotencyMismatch =
        stripeErr.code === "idempotency_error" ||
        stripeErr.type === "idempotency_error" ||
        stripeErr.statusCode === 409;
      if (isIdempotencyMismatch) {
        const reSnap = await bookingRef.get();
        if (!reSnap.exists) throw createErr;
        const reBooking = reSnap.data() as Booking;
        const existingPiId = reBooking.stripe?.finalPaymentIntentId;
        if (existingPiId) {
          const pi = await stripe.paymentIntents.retrieve(existingPiId);
          if (pi.status === "succeeded") {
            return NextResponse.json({ error: "This booking is already fully paid" }, { status: 400 });
          }
          if (pi.status === "processing") {
            return NextResponse.json({
              status: "processing",
              message: "Your payment is still processing. Please wait a moment and refresh the page to check status.",
              paymentIntentId: pi.id,
              finalCents,
            });
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
            return NextResponse.json({ error: "Previous payment was canceled; please try again" }, { status: 400 });
          }
        }
      }
      throw createErr;
    }
    if (!paymentIntent.client_secret) {
      return NextResponse.json({ error: "PaymentIntent missing client secret" }, { status: 500 });
    }
    await bookingRef.update({
      "stripe.finalPaymentIntentId": paymentIntent.id,
      status: "final_processing",
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
