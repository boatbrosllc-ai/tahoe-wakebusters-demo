/**
 * POST /api/admin/bookings/[id]/patch-stripe-data
 * Validates Stripe customer + payment method, then patches booking.stripe.customerId / paymentMethodId.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminEmailFromSessionCookie, requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import type { Booking } from "@/lib/booking/types";
import { writeAdminAuditLog } from "@/lib/booking/admin-audit-log";

type Body = { customerId?: string; paymentMethodId?: string };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id: bookingId } = await params;
  if (!bookingId?.trim()) {
    return NextResponse.json({ error: "Missing booking id" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const customerId = typeof body.customerId === "string" ? body.customerId.trim() : "";
  const paymentMethodId = typeof body.paymentMethodId === "string" ? body.paymentMethodId.trim() : "";
  if (!customerId.startsWith("cus_") || !paymentMethodId.startsWith("pm_")) {
    return NextResponse.json(
      { error: "Body must include valid Stripe customerId (cus_…) and paymentMethodId (pm_…)" },
      { status: 400 }
    );
  }

  try {
    const stripe = getStripe();
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
      return NextResponse.json({ error: "Stripe customer is deleted" }, { status: 400 });
    }
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    const pmCustomer =
      typeof pm.customer === "string" ? pm.customer : (pm.customer as { id?: string } | null)?.id ?? null;
    if (pmCustomer !== customerId) {
      return NextResponse.json(
        { error: "Payment method does not belong to the given Stripe customer" },
        { status: 400 }
      );
    }

    const db = getDb();
    const { FieldValue } = getFirestoreExports();
    const ref = db.collection("bookings").doc(bookingId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error("BOOKING_NOT_FOUND");
      const b = snap.data() as Booking;
      if (b.status !== "final_due" && b.status !== "final_failed" && b.status !== "final_requires_action") {
        throw new Error("BOOKING_STATUS_NOT_PATCHABLE");
      }
      tx.update(ref, {
        "stripe.customerId": customerId,
        "stripe.paymentMethodId": paymentMethodId,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    const adminEmail = await getAdminEmailFromSessionCookie(request.headers.get("cookie"));
    await writeAdminAuditLog("booking_patch_stripe_data", {
      bookingId,
      customerId,
      paymentMethodId,
      adminEmail: adminEmail ?? undefined,
    });

    return NextResponse.json({ ok: true, bookingId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "BOOKING_NOT_FOUND") {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    if (message === "BOOKING_STATUS_NOT_PATCHABLE") {
      return NextResponse.json(
        { error: "Stripe data can only be patched for final_due, final_failed, or final_requires_action bookings." },
        { status: 409 }
      );
    }
    const isStripe = /Stripe|stripe/i.test(message);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : isStripe ? 400 : 500 }
    );
  }
}
