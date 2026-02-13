/**
 * POST /api/booking/manage/attach-payment-method
 * Body: { token, paymentMethodId }. Attach PM to customer, set as default, update booking card display.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { verifyManageToken } from "@/lib/booking/manageToken";
import type { Booking } from "@/lib/booking/types";

function parseBody(body: unknown): { token: string; paymentMethodId: string } | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const token = typeof o.token === "string" ? o.token.trim() : null;
  const paymentMethodId = typeof o.paymentMethodId === "string" ? o.paymentMethodId.trim() : null;
  if (!token || !paymentMethodId) return null;
  return { token, paymentMethodId };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const input = parseBody(body);
    if (!input) {
      return NextResponse.json({ error: "Missing token or paymentMethodId" }, { status: 400 });
    }
    const payload = verifyManageToken(input.token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
    }
    const db = getDb();
    const { Timestamp } = getFirestoreExports();
    const bookingSnap = await db.collection("bookings").doc(payload.bookingId).get();
    if (!bookingSnap.exists) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    const booking = bookingSnap.data() as Booking;
    const customerId = booking.stripe?.customerId;
    if (!customerId) {
      return NextResponse.json({ error: "No customer on booking" }, { status: 400 });
    }
    const stripe = getStripe();
    const pm = await stripe.paymentMethods.retrieve(input.paymentMethodId);
    if (pm.customer && pm.customer !== customerId) {
      return NextResponse.json({ error: "Payment method belongs to another customer" }, { status: 400 });
    }
    if (!pm.customer) {
      await stripe.paymentMethods.attach(input.paymentMethodId, { customer: customerId });
    }
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: input.paymentMethodId },
    });
    const card = pm.card;
    const cardDisplay = card
      ? {
          brand: card.brand,
          last4: card.last4,
          expMonth: card.exp_month,
          expYear: card.exp_year,
        }
      : undefined;
    await db.collection("bookings").doc(payload.bookingId).update({
      "stripe.paymentMethodId": input.paymentMethodId,
      ...(cardDisplay && { card: cardDisplay }),
    });
    return NextResponse.json({ ok: true, card: cardDisplay });
  } catch (err) {
    if (err instanceof Error && err.message.includes("MANAGE_BOOKING_SECRET")) {
      return NextResponse.json({ error: "Manage links are not configured" }, { status: 503 });
    }
    console.error("[manage/attach-payment-method]", err);
    return NextResponse.json({ error: "Failed to attach payment method" }, { status: 500 });
  }
}
