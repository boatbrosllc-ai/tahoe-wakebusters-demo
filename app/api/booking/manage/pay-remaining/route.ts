/**
 * POST /api/booking/manage/pay-remaining
 * Body: { token }. Creates or reuses PaymentIntent for final amount; returns client_secret.
 * Idempotent: reuses existing in-flight intent when possible; deterministic idempotency key per booking.
 * `stripe.customerPayLockAt` is refreshed whenever we return or create a customer final PI so
 * run-final-charges skips cancel/recreate for ~30 minutes (see final-charge-idempotency).
 * `stripe.customerFinalPiInFlightAt` is set in the same Firestore transaction that authorizes
 * creating a new final PI (before Stripe) so cron and a second tab cannot race a second PI.
 */

import { NextRequest, NextResponse } from "next/server";
import type { DocumentData, UpdateData } from "firebase-admin/firestore";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { verifyManageToken } from "@/lib/booking/manageToken";
import {
  getFinalChargeIdempotencyKey,
  isFinalChargeLockRecent,
  isCustomerFinalPiInFlightRecent,
} from "@/lib/booking/final-charge-idempotency";
import { checkRateLimit, getClientKey, getManageRateLimitKey } from "@/lib/booking/rate-limit";
import type { Booking } from "@/lib/booking/types";
import { applyFinalPaymentRevenueIncrement } from "@/lib/booking/summary-revenue";

const ALLOWED_STATUSES = ["final_due", "final_failed", "final_requires_action", "final_processing"] as const;

type FinalPiGateResult =
  | { kind: "busy_cron" }
  | { kind: "busy_customer" }
  | { kind: "reuse"; existingPiId: string }
  | { kind: "acquired_create" };

function getTokenFromRequest(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const t = auth.slice(7).trim();
    return t || null;
  }
  return null;
}

function parseBody(body: unknown): { token: string | null; skipSavedPaymentMethod: boolean } | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const token = typeof o.token === "string" ? o.token.trim() : null;
  const skipSavedPaymentMethod = o.skipSavedPaymentMethod === true;
  return { token: token || null, skipSavedPaymentMethod };
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
    let token = getTokenFromRequest(request);
    const parsed = parseBody(body);
    if (!token) token = parsed?.token ?? null;
    const skipSavedPaymentMethod = parsed?.skipSavedPaymentMethod === true;
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }
    const payload = verifyManageToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
    }
    if (!payload.email) {
      return NextResponse.json({ error: "This link is not valid for this booking" }, { status: 403 });
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
    const { FieldValue, Timestamp } = getFirestoreExports();
    const bookingRef = db.collection("bookings").doc(payload.bookingId);
    const touchCustomerPayLock = () =>
      bookingRef.update({
        "stripe.customerPayLockAt": FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    const clearCustomerFinalPiInFlight = () =>
      bookingRef.update({
        "stripe.customerFinalPiInFlightAt": FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });

    const runCustomerFinalPiGate = async (now: Date): Promise<FinalPiGateResult> =>
      db.runTransaction(async (tx): Promise<FinalPiGateResult> => {
        const snap = await tx.get(bookingRef);
        if (!snap.exists) throw new Error("Booking not found");
        const b = snap.data() as Booking;
        const currentStatus = b.status;
        const currentPiId = b.stripe?.finalPaymentIntentId;
        const lockAt = b.stripe?.finalChargeLockAt;
        const inFlightAt = b.stripe?.customerFinalPiInFlightAt;
        if (currentStatus === "final_paid") {
          throw new Error("Booking is already fully paid");
        }
        if (isFinalChargeLockRecent(lockAt, now) && !currentPiId) {
          return { kind: "busy_cron" };
        }
        if (isCustomerFinalPiInFlightRecent(inFlightAt, now) && !currentPiId) {
          return { kind: "busy_customer" };
        }
        if (
          currentPiId &&
          (currentStatus === "final_processing" ||
            currentStatus === "final_due" ||
            currentStatus === "final_failed" ||
            currentStatus === "final_requires_action")
        ) {
          return { kind: "reuse", existingPiId: currentPiId };
        }
        if (!ALLOWED_STATUSES.includes(currentStatus as (typeof ALLOWED_STATUSES)[number])) {
          throw new Error("Booking is not in a state that allows paying remaining balance");
        }
        tx.update(bookingRef, {
          "stripe.customerFinalPiInFlightAt": Timestamp.fromDate(now),
          "stripe.customerPayLockAt": FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { kind: "acquired_create" };
      });

    const bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    const booking = bookingSnap.data() as Booking;
    const bookingEmail = booking.customer?.email?.trim().toLowerCase();
    if (!bookingEmail || bookingEmail !== payload.email) {
      return NextResponse.json({ error: "This link is not valid for this booking" }, { status: 403 });
    }
    const customerId = booking.stripe?.customerId;
    const finalCents = booking.stripe?.finalAmountCents ?? 0;
    if (!customerId) {
      return NextResponse.json({ error: "No customer on booking" }, { status: 400 });
    }
    if (finalCents <= 0) {
      return NextResponse.json({ error: "No remaining balance to pay" }, { status: 400 });
    }
    const status = booking.status;
    if (!ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
      return NextResponse.json({ error: "Booking is not in a state that allows paying remaining balance" }, { status: 400 });
    }

    const stripe = getStripe();
    const now = new Date();

    /** Webhook/cron may lag; PI can be succeeded while booking is still final_due / final_processing. Idempotent. */
    const reconcileBookingToFinalPaidFromSucceededIntent = async (piId: string) => {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(bookingRef);
        if (!snap.exists) return;
        const b = snap.data() as Booking;
        const storedPi = b.stripe?.finalPaymentIntentId;
        if (storedPi && storedPi !== piId) return;
        if (b.status === "final_paid" && storedPi === piId && b.stripe?.finalChargedAt) return;
        const sb = b.stripe;
        const isDepositFlow = typeof sb?.depositAmountCents === "number";
        const finalRev = typeof sb?.finalAmountCents === "number" ? sb.finalAmountCents : 0;
        if (isDepositFlow && finalRev > 0 && sb?.finalRevenueSummaryApplied !== true) {
          applyFinalPaymentRevenueIncrement(tx, db, FieldValue, finalRev);
        }
        const patch: Record<string, unknown> = {
          "stripe.finalPaymentIntentId": piId,
          "stripe.finalChargedAt": Timestamp.now(),
          "stripe.finalError": FieldValue.delete(),
          "stripe.customerFinalPiInFlightAt": FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
          ...(isDepositFlow && finalRev > 0 && sb?.finalRevenueSummaryApplied !== true
            ? { "stripe.finalRevenueSummaryApplied": true }
            : {}),
        };
        if (b.status !== "final_paid") {
          patch.status = "final_paid";
        }
        tx.update(bookingRef, patch as UpdateData<DocumentData>);
      });
    };

    let attemptOffSessionFinal =
      typeof booking.stripe?.paymentMethodId === "string" &&
      booking.stripe.paymentMethodId.trim().length > 0 &&
      !skipSavedPaymentMethod;

    for (;;) {
      const gate = await runCustomerFinalPiGate(now);
      if (gate.kind === "busy_cron" || gate.kind === "busy_customer") {
        return NextResponse.json(
          { error: "A final charge is in progress. Please wait a moment and try again." },
          { status: 409 }
        );
      }

      if (gate.kind === "reuse") {
        const pi = await stripe.paymentIntents.retrieve(gate.existingPiId);
        if (pi.status === "succeeded") {
          await reconcileBookingToFinalPaidFromSucceededIntent(pi.id);
          return NextResponse.json({
            status: "succeeded",
            message: "Your booking is fully paid. Refresh the page if the balance still shows.",
            paymentIntentId: pi.id,
            finalCents: 0,
          });
        }
        if (pi.status === "processing") {
          await touchCustomerPayLock();
          return NextResponse.json({
            status: "processing",
            message: "Your payment is still processing. Please wait a moment and refresh the page to check status.",
            paymentIntentId: pi.id,
            finalCents,
          });
        }
        if (pi.status === "requires_payment_method" || pi.status === "requires_confirmation" || pi.status === "requires_action") {
          if (!pi.client_secret) {
            return NextResponse.json({ error: "PaymentIntent missing client secret" }, { status: 500 });
          }
          await touchCustomerPayLock();
          return NextResponse.json({
            clientSecret: pi.client_secret,
            paymentIntentId: pi.id,
            finalCents,
          });
        }
        if (pi.status === "canceled") {
          await bookingRef.update({
            status: "final_due",
            "stripe.finalPaymentIntentId": FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          continue;
        }
        await clearCustomerFinalPiInFlight().catch(() => {});
        return NextResponse.json({ error: "Unexpected PaymentIntent state; please try again" }, { status: 400 });
      }

      if (gate.kind === "acquired_create") {
        const idempotencyKey = getFinalChargeIdempotencyKey(payload.bookingId, "customer");
        const savedPmId =
          typeof booking.stripe?.paymentMethodId === "string" ? booking.stripe.paymentMethodId.trim() : "";

        if (savedPmId && attemptOffSessionFinal) {
          try {
            const offPi = await stripe.paymentIntents.create(
              {
                amount: finalCents,
                currency: "usd",
                customer: customerId,
                payment_method: savedPmId,
                off_session: true,
                confirm: true,
                metadata: { bookingId: payload.bookingId, payment_stage: "final" },
              },
              { idempotencyKey }
            );
            if (offPi.status === "succeeded") {
              await bookingRef.update({
                "stripe.finalPaymentIntentId": offPi.id,
                "stripe.customerFinalPiInFlightAt": FieldValue.delete(),
                updatedAt: FieldValue.serverTimestamp(),
              });
              await reconcileBookingToFinalPaidFromSucceededIntent(offPi.id);
              return NextResponse.json({
                status: "succeeded",
                message: "Your booking is fully paid. Refresh the page if the balance still shows.",
                paymentIntentId: offPi.id,
                finalCents: 0,
              });
            }
            if (offPi.status === "processing") {
              await bookingRef.update({
                "stripe.finalPaymentIntentId": offPi.id,
                "stripe.customerFinalPiInFlightAt": FieldValue.delete(),
                updatedAt: FieldValue.serverTimestamp(),
              });
              await touchCustomerPayLock();
              return NextResponse.json({
                status: "processing",
                message: "Your payment is still processing. Please wait a moment and refresh the page to check status.",
                paymentIntentId: offPi.id,
                finalCents,
              });
            }
            if (
              offPi.status === "requires_payment_method" ||
              offPi.status === "requires_confirmation" ||
              offPi.status === "requires_action"
            ) {
              if (!offPi.client_secret) {
                await clearCustomerFinalPiInFlight().catch(() => {});
                return NextResponse.json({ error: "PaymentIntent missing client secret" }, { status: 500 });
              }
              await bookingRef.update({
                "stripe.finalPaymentIntentId": offPi.id,
                "stripe.customerFinalPiInFlightAt": FieldValue.delete(),
                updatedAt: FieldValue.serverTimestamp(),
              });
              await touchCustomerPayLock();
              return NextResponse.json({
                clientSecret: offPi.client_secret,
                paymentIntentId: offPi.id,
                finalCents,
              });
            }
            if (offPi.status === "canceled") {
              attemptOffSessionFinal = false;
              await clearCustomerFinalPiInFlight().catch(() => {});
              continue;
            }
            await clearCustomerFinalPiInFlight().catch(() => {});
            return NextResponse.json({ error: "Unexpected PaymentIntent state; please try again" }, { status: 400 });
          } catch (offErr: unknown) {
            const failedPiId = (offErr as { payment_intent?: { id?: string } }).payment_intent?.id;
            if (failedPiId) await stripe.paymentIntents.cancel(failedPiId).catch(() => {});
            attemptOffSessionFinal = false;
            await clearCustomerFinalPiInFlight().catch(() => {});
            console.warn("[manage/pay-remaining] off_session final charge failed, retrying with client confirmation", offErr);
            continue;
          }
        }

        const useElementSuffix =
          skipSavedPaymentMethod || (Boolean(savedPmId) && !attemptOffSessionFinal);

        let paymentIntent: Awaited<ReturnType<typeof stripe.paymentIntents.create>>;
        try {
          paymentIntent = await stripe.paymentIntents.create(
            {
              amount: finalCents,
              currency: "usd",
              customer: customerId,
              payment_method_types: ["card", "link"],
              metadata: { bookingId: payload.bookingId, payment_stage: "final" },
            },
            { idempotencyKey: useElementSuffix ? `${idempotencyKey}:element` : idempotencyKey }
          );
        } catch (createErr: unknown) {
          const stripeErr = createErr as { code?: string; type?: string; statusCode?: number };
          const isIdempotencyMismatch =
            stripeErr.code === "idempotency_error" ||
            stripeErr.type === "idempotency_error" ||
            stripeErr.statusCode === 409;
          if (isIdempotencyMismatch) {
            await clearCustomerFinalPiInFlight().catch(() => {});
            const reSnap = await bookingRef.get();
            if (!reSnap.exists) throw createErr;
            const reBooking = reSnap.data() as Booking;
            const existingPiId = reBooking.stripe?.finalPaymentIntentId;
            if (existingPiId) {
              const pi = await stripe.paymentIntents.retrieve(existingPiId);
              if (pi.status === "succeeded") {
                await reconcileBookingToFinalPaidFromSucceededIntent(pi.id);
                return NextResponse.json({
                  status: "succeeded",
                  message: "Your booking is fully paid. Refresh the page if the balance still shows.",
                  paymentIntentId: pi.id,
                  finalCents: 0,
                });
              }
              if (pi.status === "processing") {
                await touchCustomerPayLock();
                return NextResponse.json({
                  status: "processing",
                  message: "Your payment is still processing. Please wait a moment and refresh the page to check status.",
                  paymentIntentId: pi.id,
                  finalCents,
                });
              }
              if (pi.status === "requires_payment_method" || pi.status === "requires_confirmation" || pi.status === "requires_action") {
                if (!pi.client_secret) {
                  return NextResponse.json({ error: "PaymentIntent missing client secret" }, { status: 500 });
                }
                await touchCustomerPayLock();
                return NextResponse.json({
                  clientSecret: pi.client_secret,
                  paymentIntentId: pi.id,
                  finalCents,
                });
              }
              if (pi.status === "canceled") {
                await bookingRef.update({
                  status: "final_due",
                  "stripe.finalPaymentIntentId": FieldValue.delete(),
                  updatedAt: FieldValue.serverTimestamp(),
                });
                continue;
              }
            }
          } else {
            await clearCustomerFinalPiInFlight().catch(() => {});
          }
          throw createErr;
        }
        if (!paymentIntent.client_secret) {
          await clearCustomerFinalPiInFlight().catch(() => {});
          return NextResponse.json({ error: "PaymentIntent missing client secret" }, { status: 500 });
        }
        await bookingRef.update({
          "stripe.finalPaymentIntentId": paymentIntent.id,
          "stripe.customerPayLockAt": FieldValue.serverTimestamp(),
          "stripe.customerFinalPiInFlightAt": FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return NextResponse.json({
          clientSecret: paymentIntent.client_secret,
          paymentIntentId: paymentIntent.id,
          finalCents,
        });
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("MANAGE_BOOKING_SECRET")) {
      return NextResponse.json({ error: "Manage links are not configured" }, { status: 503 });
    }
    if (err instanceof Error && (err.message === "Booking not found" || err.message === "Booking is already fully paid" || err.message === "Booking is not in a state that allows paying remaining balance")) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[manage/pay-remaining]", err);
    return NextResponse.json({ error: "Failed to create payment intent" }, { status: 500 });
  }
}
