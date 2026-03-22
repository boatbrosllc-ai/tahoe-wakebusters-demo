/**
 * Admin-only: create a booking in Firestore from an existing Stripe PaymentIntent
 * that already succeeded. Use when payments completed in Stripe but no booking
 * was created (e.g. webhook/complete-after-payment didn't run).
 * Only works if the hold still exists in Firestore and status is "active".
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { convertHoldToBooking } from "@/lib/booking/convert-hold-to-booking";
import {
  buildConvertHoldInputFromSucceededPaymentIntent,
  paymentIntentMatchesHoldForConversion,
} from "@/lib/booking/stripe-payment-intent-convert";
import { upsertPendingRefundRecord } from "@/lib/booking/pending-refund-idempotent";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";

function parseBody(body: unknown): { paymentIntentId: string } | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const id = typeof o.paymentIntentId === "string" ? o.paymentIntentId.trim() : null;
  if (!id || !id.startsWith("pi_")) return null;
  return { paymentIntentId: id };
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const input = parseBody(body);
    if (!input) {
      return NextResponse.json(
        { error: "Body must be { paymentIntentId: \"pi_xxx\" }" },
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
    const holdData = holdSnap.data() as {
      pricing?: { totalCents?: number };
      tipCents?: number;
      discountCents?: number;
      depositPaymentIntentId?: string;
      fullPaymentIntentId?: string;
      paymentAttemptVersion?: number;
      customerDraft?: { email?: string };
    };
    const holdForPricing = {
      pricing: holdData.pricing,
      tipCents: holdData.tipCents,
      discountCents: holdData.discountCents,
    };
    const holdIntentIds = {
      depositPaymentIntentId: holdData.depositPaymentIntentId,
      fullPaymentIntentId: holdData.fullPaymentIntentId,
      paymentAttemptVersion: holdData.paymentAttemptVersion,
    };
    if (!paymentIntentMatchesHoldForConversion(pi, holdIntentIds, holdForPricing).ok) {
      try {
        await upsertPendingRefundRecord(
          db,
          {
            reason: "admin_sync_pi_hold_mismatch",
            holdId,
            paymentIntentId: input.paymentIntentId,
          },
          {
            holdId,
            paymentIntentId: input.paymentIntentId,
            holdDepositPaymentIntentId: holdIntentIds.depositPaymentIntentId ?? null,
            holdFullPaymentIntentId: holdIntentIds.fullPaymentIntentId ?? null,
            ...(holdData.customerDraft?.email && { customerEmail: holdData.customerDraft.email }),
          }
        );
      } catch (e) {
        console.error("[admin/sync-stripe-payment] pendingRefunds write failed", e);
      }
      await writeOperationalAlert({
        type: "admin_sync_payment_intent_hold_mismatch",
        holdId,
        paymentIntentId: input.paymentIntentId,
        holdDepositPaymentIntentId: holdIntentIds.depositPaymentIntentId,
        holdFullPaymentIntentId: holdIntentIds.fullPaymentIntentId,
        source: "admin-sync-stripe-payment",
      });
      return NextResponse.json(
        {
          error:
            "This PaymentIntent does not match the deposit/full intent IDs stored on the hold. Conversion is blocked pending reconciliation.",
          code: "PI_HOLD_MISMATCH",
        },
        { status: 409 }
      );
    }
    const convertInput = buildConvertHoldInputFromSucceededPaymentIntent(pi, holdForPricing);
    const result = await convertHoldToBooking(db, holdId, convertInput);

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
