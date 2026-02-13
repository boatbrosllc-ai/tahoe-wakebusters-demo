/**
 * POST /api/booking/manage/create-setup-intent
 * Body: { token }. Creates SetupIntent for updating card; returns client_secret.
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
