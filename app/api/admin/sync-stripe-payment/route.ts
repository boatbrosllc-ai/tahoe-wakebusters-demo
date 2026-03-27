/**
 * Admin-only: create a booking in Firestore from an existing Stripe PaymentIntent
 * that already succeeded. Use when payments completed in Stripe but no booking
 * was created (e.g. webhook/complete-after-payment didn't run).
 * Normally requires an active hold; pass `forceExpired: true` to convert after expiry when the PI succeeded (audit logged).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT, getAdminEmailFromSessionCookie } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { resolveAndConvertPayment } from "@/lib/booking/resolve-and-convert-payment";
import { writeAdminAuditLog } from "@/lib/booking/admin-audit-log";
import { buildConvertHoldInputFromSucceededPaymentIntent, customerOverrideFromPaymentIntent } from "@/lib/booking/stripe-payment-intent-convert";
import { isConvertHoldInputDeposit } from "@/lib/booking/convert-hold-to-booking";
import type { Hold } from "@/lib/booking/types";

function parseBody(body: unknown): { paymentIntentId: string; dryRun: boolean; forceExpired: boolean } | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const id = typeof o.paymentIntentId === "string" ? o.paymentIntentId.trim() : null;
  if (!id || !id.startsWith("pi_")) return null;
  return { paymentIntentId: id, dryRun: o.dryRun === true, forceExpired: o.forceExpired === true };
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const input = parseBody(body);
    if (!input) {
      return NextResponse.json(
        { error: "Body must be { paymentIntentId: \"pi_xxx\", dryRun?: boolean, forceExpired?: boolean }" },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const pi = await stripe.paymentIntents.retrieve(input.paymentIntentId, { expand: ["payment_method"] });
    if (pi.status !== "succeeded") {
      return NextResponse.json(
        { error: `Payment intent status is "${pi.status}", not "succeeded". Only succeeded payments can be synced.` },
        { status: 400 }
      );
    }

    const holdId = pi.metadata?.holdId;
    if (!holdId || typeof holdId !== "string") {
      return NextResponse.json(
        { error: "Payment intent has no holdId in metadata. This payment may be from an older flow." },
        { status: 400 }
      );
    }

    const db = getDb();

    const piId = input.paymentIntentId;
    const dupChecks = await Promise.all([
      db.collection("bookings").where("stripe.paymentIntentId", "==", piId).limit(1).get(),
      db.collection("bookings").where("stripe.depositPaymentIntentId", "==", piId).limit(1).get(),
      db.collection("bookings").where("stripe.finalPaymentIntentId", "==", piId).limit(1).get(),
    ]);
    const existingBookingId = dupChecks.find((s) => !s.empty)?.docs[0]?.id;
    if (existingBookingId) {
      return NextResponse.json(
        {
          error: "A booking already exists for this Payment Intent.",
          bookingId: existingBookingId,
          code: "BOOKING_EXISTS_FOR_PAYMENT_INTENT",
        },
        { status: 409 },
      );
    }

    const holdSnap = await db.collection("holds").doc(holdId).get();
    if (!holdSnap.exists) {
      return NextResponse.json(
        {
          error: "Hold not found",
          hint: "The hold may have been deleted or was created in a different environment (e.g. local vs production).",
        },
        { status: 404 }
      );
    }
    if (input.dryRun) {
      const hold = holdSnap.data() as Hold;
      const holdDraft = hold.customerDraft ?? { name: "", email: "", phone: "" };
      const customerOverride = customerOverrideFromPaymentIntent(pi, holdDraft);
      const convertInput = await buildConvertHoldInputFromSucceededPaymentIntent(
        pi,
        {
          pricing: hold.pricing,
          tipCents: (hold as { tipCents?: number }).tipCents,
          discountCents: (hold as { discountCents?: number }).discountCents,
        },
        customerOverride ? { customerOverride } : undefined
      );
      const isDeposit = isConvertHoldInputDeposit(convertInput);
      const totalCents = isDeposit
        ? (convertInput as { stripe: { totalCents: number } }).stripe.totalCents
        : parseInt(pi.metadata?.totalCents ?? "0", 10) || (pi.amount ?? 0);
      const depositCents = isDeposit ? (pi.amount ?? 0) : totalCents;
      return NextResponse.json({
        success: true,
        dryRun: true,
        hold: {
          id: holdId,
          experienceId: hold.experienceId,
          slotId: hold.slotId,
          customer: hold.customerDraft ?? null,
          pricing: hold.pricing ?? null,
        },
        paymentSummary: {
          isDeposit,
          totalCents,
          depositCents,
          finalCents: Math.max(0, totalCents - depositCents),
        },
        convertInput: { paymentStage: convertInput.paymentStage },
      });
    }
    const conversion = await resolveAndConvertPayment(db, {
      paymentIntentId: input.paymentIntentId,
      holdId,
      source: "client",
      paymentIntent: pi,
      ...(input.forceExpired ? { forceExpiredConversion: true } : {}),
    });
    const result = conversion.result;

    if ("amountIntegrityMismatch" in result) {
      return NextResponse.json(
        {
          error:
            "The charged amount does not match current hold pricing. A refund may be pending — see pendingRefunds in Admin.",
          code: "AMOUNT_INTEGRITY_MISMATCH",
        },
        { status: 409 }
      );
    }

    if ("alreadyConverted" in result) {
      return NextResponse.json({
        success: true,
        alreadyConverted: true,
        message: "This payment was already converted to a booking (hold was no longer active).",
      });
    }
    if (input.forceExpired) {
      const adminEmail = await getAdminEmailFromSessionCookie(request.headers.get("cookie"));
      await writeAdminAuditLog("sync_stripe_payment_force_expired_conversion", {
        bookingId: result.bookingId,
        holdId,
        paymentIntentId: input.paymentIntentId,
        adminEmail: adminEmail ?? undefined,
      });
    }
    return NextResponse.json({
      success: true,
      bookingId: result.bookingId,
      message: "Booking created from Stripe payment.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    const status =
      message === "Hold not found" ? 404 :
      message === "Hold has expired" ? 409 :
      isFirebaseConfig ? 503 : 500;
    return NextResponse.json(
      {
        error: message,
        ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }),
        ...(message === "Hold not found" && {
          hint: "The hold may have been deleted or was created in a different environment (e.g. local vs production).",
        }),
        ...(message === "Hold has expired" && {
          hint: "The hold's expiry time has passed. The payment succeeded but the hold is no longer valid for conversion.",
        }),
      },
      { status }
    );
  }
}
