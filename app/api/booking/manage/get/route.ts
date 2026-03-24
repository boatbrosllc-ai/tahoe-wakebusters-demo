/**
 * POST /api/booking/manage/get
 * Body: { token }. Verify token and return sanitized booking summary (no sensitive data).
 * Token must be sent in request body or Authorization: Bearer header so it is never logged in URLs.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { verifyManageToken } from "@/lib/booking/manageToken";
import { checkRateLimit, getClientKey, getManageRateLimitKey } from "@/lib/booking/rate-limit";
import {
  MANAGE_BOOKING_EMAIL_BIND_COOKIE,
  signManageBookingEmailBind,
} from "@/lib/booking/manage-booking-bind-cookie";
import { resolveManageCustomerEmail } from "@/lib/booking/manage-booking-resolve-email";
import type { Booking } from "@/lib/booking/types";
import { resolveFinalBalanceFromBooking } from "@/lib/booking/final-balance-resolver";

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

function toDateStr(ts: { seconds?: number; toDate?: () => Date } | string | undefined): string | null {
  if (!ts) return null;
  if (typeof ts === "string") return ts;
  if (ts.toDate) return ts.toDate().toISOString();
  if (typeof ts.seconds === "number") return new Date(ts.seconds * 1000).toISOString();
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
    const bodyJson = await request.json().catch(() => null);
    let token = getTokenFromRequest(request);
    let customerEmailFromBody: string | null = null;
    if (!token) {
      const parsed = parseBody(bodyJson);
      token = parsed?.token ?? null;
      customerEmailFromBody = parsed?.customerEmail ?? null;
    } else {
      const o = bodyJson != null && typeof bodyJson === "object" ? (bodyJson as Record<string, unknown>) : {};
      const ce = typeof o.customerEmail === "string" ? o.customerEmail.trim().toLowerCase() : null;
      customerEmailFromBody = ce;
    }
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }
    const payload = verifyManageToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
    }
    const customerEmail = resolveManageCustomerEmail(request, payload.bookingId, customerEmailFromBody);
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
    const bookingSnap = await db.collection("bookings").doc(payload.bookingId).get();
    if (!bookingSnap.exists) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    const booking = bookingSnap.data() as Booking;
    const bookingEmail = booking.customer?.email?.trim().toLowerCase();
    if (!bookingEmail || bookingEmail !== customerEmail) {
      return NextResponse.json({ error: "This link is not valid for this booking" }, { status: 403 });
    }
    const stripe = booking.stripe ?? {};
    const card = booking.card;
    const status = booking.status;
    const finalChargeAt = booking.finalChargeAt;
    const finalBalance = resolveFinalBalanceFromBooking(booking);
    const finalCents = finalBalance.authoritativeFinalCents;
    const depositCents = stripe.depositAmountCents ?? 0;
    const totalCents = stripe.totalAmountCents ?? booking.pricing?.totalCents ?? 0;
    // Allow recovery when booking has an incomplete final intent (e.g. stuck in final_processing).
    const canPayRemaining =
      (status === "final_due" ||
        status === "final_failed" ||
        status === "final_requires_action" ||
        status === "final_processing") &&
      finalCents > 0;

    const res = NextResponse.json({
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
      paymentMethodOnFile: typeof stripe.paymentMethodId === "string" && stripe.paymentMethodId.length > 0,
    });
    const bind = signManageBookingEmailBind(payload.bookingId, customerEmail);
    if (bind) {
      res.cookies.set(MANAGE_BOOKING_EMAIL_BIND_COOKIE, bind, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60,
      });
    }
    return res;
  } catch (err) {
    if (err instanceof Error && err.message.includes("MANAGE_BOOKING_SECRET")) {
      return NextResponse.json({ error: "Manage links are not configured" }, { status: 503 });
    }
    console.error("[manage/get]", err);
    return NextResponse.json({ error: "Failed to load booking" }, { status: 500 });
  }
}
