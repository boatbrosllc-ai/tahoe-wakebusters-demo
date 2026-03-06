/**
 * GET /api/booking/manage/get?token=...
 * Verify token and return sanitized booking summary (no sensitive data).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { verifyManageToken } from "@/lib/booking/manageToken";
import type { Booking } from "@/lib/booking/types";

function toDateStr(ts: { seconds?: number; toDate?: () => Date } | string | undefined): string | null {
  if (!ts) return null;
  if (typeof ts === "string") return ts;
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toISOString();
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }
    const payload = verifyManageToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
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
    const stripe = booking.stripe ?? {};
    const card = booking.card;
    const status = booking.status;
    const finalChargeAt = booking.finalChargeAt;
    const finalCents = stripe.finalAmountCents ?? 0;
    const depositCents = stripe.depositAmountCents ?? 0;
    const totalCents = stripe.totalAmountCents ?? booking.pricing?.totalCents ?? 0;
    const canPayRemaining =
      (status === "final_due" || status === "final_failed" || status === "final_requires_action") && finalCents > 0;

    return NextResponse.json({
      bookingId: payload.bookingId,
      customerName: booking.customer?.name,
      startDateStr: booking.startDateStr,
      pricing: booking.pricing,
      status,
      finalChargeAt: toDateStr(finalChargeAt as { seconds?: number; toDate?: () => Date } | undefined),
      depositCents,
      finalCents,
      totalCents,
      card: card ? { brand: card.brand, last4: card.last4, expMonth: card.expMonth, expYear: card.expYear } : null,
      canPayRemaining,
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("MANAGE_BOOKING_SECRET")) {
      return NextResponse.json({ error: "Manage links are not configured" }, { status: 503 });
    }
    console.error("[manage/get]", err);
    return NextResponse.json({ error: "Failed to load booking" }, { status: 500 });
  }
}
