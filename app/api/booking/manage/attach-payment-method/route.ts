/**
 * POST /api/booking/manage/attach-payment-method
 * Body: { token, paymentMethodId }. Attach PM to customer, set as default, update booking card display.
 * Token may be sent in body or Authorization: Bearer header.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { verifyManageToken } from "@/lib/booking/manageToken";
import { checkRateLimit, getClientKey, getManageRateLimitKey } from "@/lib/booking/rate-limit";
import type { Booking } from "@/lib/booking/types";
import { resolveManageCustomerEmail } from "@/lib/booking/manage-booking-resolve-email";

function getTokenFromRequest(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const t = auth.slice(7).trim();
    return t || null;
  }
  return null;
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
    const body = await request.json().catch(() => null);
    const o = body != null && typeof body === "object" ? (body as Record<string, unknown>) : {};
    let token = getTokenFromRequest(request) ?? (typeof o.token === "string" ? o.token.trim() : null);
    const paymentMethodId = typeof o.paymentMethodId === "string" ? o.paymentMethodId.trim() : null;
    const bodyEmail = typeof o.customerEmail === "string" ? o.customerEmail.trim().toLowerCase() : null;
    if (!token || !paymentMethodId) {
      return NextResponse.json({ error: "Missing token or paymentMethodId" }, { status: 400 });
    }
    const payload = verifyManageToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
    }
    const customerEmail = resolveManageCustomerEmail(request, payload.bookingId, bodyEmail);
    if (!customerEmail) {
      return NextResponse.json({ error: "customerEmail is required in the request body" }, { status: 400 });
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
    const { Timestamp, FieldValue } = getFirestoreExports();
    const bookingSnap = await db.collection("bookings").doc(payload.bookingId).get();
    if (!bookingSnap.exists) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    const booking = bookingSnap.data() as Booking;
    const bookingEmail = booking.customer?.email?.trim().toLowerCase();
    if (!bookingEmail || bookingEmail !== customerEmail) {
      return NextResponse.json({ error: "This link is not valid for this booking" }, { status: 403 });
    }
    const ACTIVE_STATUSES = ["paid", "final_due", "final_failed", "final_requires_action", "final_processing"];
    if (!ACTIVE_STATUSES.includes(booking.status)) {
      return NextResponse.json({ error: "Booking is no longer active; card updates are not allowed" }, { status: 400 });
    }
    const customerId = booking.stripe?.customerId;
    if (!customerId) {
      return NextResponse.json({ error: "No customer on booking" }, { status: 400 });
    }
    const stripe = getStripe();
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer && pm.customer !== customerId) {
      return NextResponse.json({ error: "Payment method belongs to another customer" }, { status: 400 });
    }
    if (!pm.customer) {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    }
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
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
      "stripe.paymentMethodId": paymentMethodId,
      ...(cardDisplay && { card: cardDisplay }),
      updatedAt: FieldValue.serverTimestamp(),
      "stripe.cardUpdatedAt": FieldValue.serverTimestamp(),
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
