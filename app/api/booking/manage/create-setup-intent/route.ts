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
    const bookingSnap = await db.collection("bookings").doc(payload.bookingId).get();
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
    const ACTIVE_STATUSES = ["paid", "deposit_paid", "final_due", "final_failed", "final_requires_action", "final_processing"];
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
