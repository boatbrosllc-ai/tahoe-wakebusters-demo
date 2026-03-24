/**
 * POST /api/booking/manage/create-setup-intent
 * Body: { token }. Creates SetupIntent for updating card; returns client_secret.
 * Token may be sent in body or Authorization: Bearer header.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
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

function parseBody(body: unknown): { token: string; customerEmail: string | null } | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const token = typeof o.token === "string" ? o.token.trim() : null;
  const customerEmail =
    typeof o.customerEmail === "string" ? o.customerEmail.trim().toLowerCase() : null;
  if (!token) return null;
  return { token, customerEmail };
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
    const bodyJson = await request.json().catch(() => null);
    let token = getTokenFromRequest(request);
    let customerEmail: string | null = null;
    if (!token) {
      const input = parseBody(bodyJson);
      token = input?.token ?? null;
      customerEmail = input?.customerEmail ?? null;
    } else {
      const o = bodyJson != null && typeof bodyJson === "object" ? (bodyJson as Record<string, unknown>) : {};
      customerEmail =
        typeof o.customerEmail === "string" ? o.customerEmail.trim().toLowerCase() : null;
    }
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }
    const payload = verifyManageToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
    }
    const resolvedEmail = resolveManageCustomerEmail(request, payload.bookingId, customerEmail);
    if (!resolvedEmail) {
      return NextResponse.json({ error: "customerEmail is required in the request body" }, { status: 400 });
    }
    customerEmail = resolvedEmail;
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
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: {
        bookingId: payload.bookingId,
        source: "manage_card_update",
      },
    });
    if (!setupIntent.client_secret) {
      return NextResponse.json({ error: "SetupIntent missing client secret" }, { status: 500 });
    }
    return NextResponse.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    if (err instanceof Error && err.message.includes("MANAGE_BOOKING_SECRET")) {
      return NextResponse.json({ error: "Manage links are not configured" }, { status: 503 });
    }
    console.error("[manage/create-setup-intent]", err);
    return NextResponse.json({ error: "Failed to create setup intent" }, { status: 500 });
  }
}
