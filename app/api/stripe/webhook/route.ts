import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/booking/stripe-client";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { sendBookingConfirmationEmail, sendFinalChargeFailedEmail, upsertBrevoContact } from "@/lib/booking/brevo";
import { logEmailSent } from "@/lib/booking/email-log";
import { buildAddonSelectionsForPricing, computePricing, getEffectiveRatePriceCents } from "@/lib/booking/pricing";
import { bookingEnv, validateWebhookEnv } from "@/lib/booking/env";
import { convertHoldToBooking } from "@/lib/booking/convert-hold-to-booking";
import type { Booking, Hold, Slot, Boat, Rate, Addon, FirestoreTimestamp, BookingCardDisplay } from "@/lib/booking/types";
import type { Experience, ExperienceRate, ExperienceAddon, BoatRate, ListingBoat } from "@/lib/booking/types";
import { signManageToken } from "@/lib/booking/manageToken";
import { DEFAULT_CANCELLATION_POLICY } from "@/lib/booking/cancellation-policy";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
import { getDepartureInventoryRef, checkCapacityAndRelease } from "@/lib/booking/shared-departure-inventory";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { formatSlotDateTime } from "@/lib/booking/format-booking-datetime";
import type { ConvertHoldInput, ConvertHoldInputDeposit } from "@/lib/booking/convert-hold-to-booking";
import { createWaiverForBooking, sendWaiverInviteAndMarkSent } from "@/lib/waiver/on-booking-created";
import { sendBookingConfirmationCopyToBusiness } from "@/lib/booking/brevo";
import { bookingLog, bookingWarn, bookingError } from "@/lib/booking/debug";

export async function POST(request: NextRequest) {
  let event: Stripe.Event | undefined;
  try {
    validateWebhookEnv();
    const body = await request.text();
    const sig = request.headers.get("stripe-signature");
    if (!sig) {
      return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
    }
    const webhookSecret = bookingEnv.stripeWebhookSecret;
    if (typeof webhookSecret !== "string" || webhookSecret.trim() === "") {
      console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is missing or empty; refusing to verify payload (would accept unsigned).");
      return NextResponse.json({ error: "Webhook misconfiguration" }, { status: 500 });
    }
    const stripe = getStripe();
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Webhook signature verification failed";
      console.error("[stripe-webhook]", message);
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const db = getDb();
    const { FieldValue, Timestamp } = getFirestoreExports();
    const eventId = event.id;
    const eventsRef = db.collection("stripeEvents");
    const PROCESSING_LEASE_MS = 5 * 60 * 1000; // 5 min — stale processing can be re-claimed for retry

    type ClaimResult = { runHandler: boolean; alreadyCompleted: boolean };
    const claimResult = await db.runTransaction(async (tx): Promise<ClaimResult> => {
      const ref = eventsRef.doc(eventId);
      const d = await tx.get(ref);
      const now = Timestamp.now();
      if (d.exists) {
        const data = d.data() as { status?: string; receivedAt?: { toDate(): Date }; leaseExpiresAt?: { toDate(): Date } };
        if (data.status === "completed") return { runHandler: false, alreadyCompleted: true };
        if (data.status === "processing") {
          const leaseExpiresAt = data.leaseExpiresAt?.toDate?.();
          const stale = leaseExpiresAt && leaseExpiresAt.getTime() < Date.now();
          if (!stale) return { runHandler: false, alreadyCompleted: false };
        }
        const leaseExpiresAt = Timestamp.fromDate(new Date(Date.now() + PROCESSING_LEASE_MS));
        tx.set(ref, { status: "processing", eventType: event!.type, receivedAt: now, leaseExpiresAt, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return { runHandler: true, alreadyCompleted: false };
      }
      const leaseExpiresAt = Timestamp.fromDate(new Date(Date.now() + PROCESSING_LEASE_MS));
      tx.set(ref, { receivedAt: now, status: "processing", eventType: event!.type, leaseExpiresAt, updatedAt: FieldValue.serverTimestamp() });
      return { runHandler: true, alreadyCompleted: false };
    });

    bookingLog("stripe-webhook", "event received", { eventIdPrefix: eventId.slice(0, 8), eventType: event.type });
    if (claimResult.alreadyCompleted) {
      bookingLog("stripe-webhook", "event already completed, skipping", { eventIdPrefix: eventId.slice(0, 8) });
      return NextResponse.json({ received: true });
    }
    if (!claimResult.runHandler) {
      bookingLog("stripe-webhook", "event processing in progress or lease held", { eventIdPrefix: eventId.slice(0, 8) });
      return NextResponse.json({ received: true });
    }

    const writeEventResult = async (
      docId: string,
      data: {
        status: "completed" | "failed_retryable" | "failed_permanent";
        processedAt: FirestoreTimestamp;
        error?: string;
        outcome?: string;
        bookingId?: string;
        holdId?: string;
        sessionId?: string;
        paymentIntentId?: string;
        amountTotal?: number;
        currency?: string;
      }
    ) => {
      await eventsRef.doc(docId).set({ ...data, updatedAt: FieldValue.serverTimestamp(), leaseExpiresAt: FieldValue.delete() }, { merge: true });
    };

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const sessionId = session.id;
      const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? undefined;
      const amountTotal = session.amount_total ?? undefined;
      const currency = session.currency ?? undefined;
      const holdId = session.metadata?.holdId;
      if (!holdId) {
        console.error("[stripe-webhook] checkout.session.completed missing holdId in metadata (permanent; no retry)", { sessionId, paymentIntentId });
        await writeEventResult(eventId, { status: "failed_permanent", processedAt: Timestamp.now(), error: "Missing holdId in session metadata", sessionId, paymentIntentId, amountTotal, currency });
        return NextResponse.json({ received: true });
      }
      const holdRef = db.collection("holds").doc(holdId);
      const holdSnap = await holdRef.get();
      if (!holdSnap.exists) {
        console.error("[stripe-webhook] checkout.session.completed hold not found", { holdId, sessionId });
        await writeEventResult(eventId, { status: "failed_retryable", processedAt: Timestamp.now(), error: "Hold not found", holdId, sessionId, paymentIntentId, amountTotal, currency });
        return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
      }
      const hold = holdSnap.data() as Hold;
      if (hold.status !== "active") {
        bookingLog("stripe-webhook", "checkout.session.completed hold not active (idempotent success)", { holdId, status: hold.status });
        await writeEventResult(eventId, {
          status: "completed",
          processedAt: Timestamp.now(),
          outcome: "checkout_session_completed_idempotent",
          error: "Hold not active",
          holdId,
          sessionId,
          paymentIntentId,
          amountTotal,
          currency,
        });
        return NextResponse.json({ received: true });
      }
      const holdExpiresAt = (hold.expiresAt as { toDate(): Date });
      if (holdExpiresAt.toDate() < new Date()) {
        bookingLog("stripe-webhook", "checkout.session.completed hold expired (idempotent success)", { holdId, sessionIdPrefix: sessionId.slice(0, 8) });
        try {
          await db.collection("pendingRefunds").add({
            holdId,
            sessionId,
            paymentIntentId,
            reason: "hold_expired_after_checkout_payment",
            status: "pending",
            createdAt: Timestamp.now(),
            amountTotal,
            currency,
          });
        } catch (refundFlagErr) {
          console.error("[stripe-webhook] Failed to write pendingRefunds for checkout hold expired", refundFlagErr);
        }
        await writeEventResult(eventId, {
          status: "completed",
          processedAt: Timestamp.now(),
          outcome: "checkout_session_completed_hold_expired_refund_flagged",
          error: "Hold expired",
          holdId,
          sessionId,
          paymentIntentId,
          amountTotal,
          currency,
        });
        return NextResponse.json({ received: true });
      }
      if (!paymentIntentId) {
        console.error("[stripe-webhook] checkout.session.completed missing payment_intent", { sessionId, holdId });
        await writeEventResult(eventId, { status: "failed_retryable", processedAt: Timestamp.now(), error: "Missing payment_intent", holdId, sessionId, amountTotal, currency });
        return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
      }
      const customerDetails = session.customer_details;
      const customerOverride = {
        name: (customerDetails?.name ?? "").trim() || hold.customerDraft.name,
        email: (customerDetails?.email ?? "").trim() || hold.customerDraft.email,
        phone: (customerDetails?.phone ?? "").trim() || hold.customerDraft.phone,
      };
      let specialNotesOverride: string | undefined;
      if (Array.isArray(session.custom_fields)) {
        const field = session.custom_fields.find((f: { key?: string }) => f.key === "special_notes");
        const v = field && (field as { value?: string | { value?: string } }).value;
        specialNotesOverride =
          typeof v === "string" ? v.trim() || undefined : typeof v === "object" && v?.value != null ? String(v.value).trim() || undefined : undefined;
      }
      const convertInput: ConvertHoldInput = {
        paymentIntentId,
        amountTotalCents: amountTotal,
        currency,
        customerOverride,
        specialNotesOverride,
        checkoutSessionId: sessionId,
      };
      try {
        const result = await convertHoldToBooking(db, holdId, convertInput);
        if ("alreadyConverted" in result) {
          bookingLog("stripe-webhook", "checkout.session.completed hold already converted", { holdId, paymentIntentIdPrefix: paymentIntentId.slice(0, 8) });
          await writeEventResult(eventId, { status: "completed", processedAt: Timestamp.now(), outcome: "already_converted", holdId, sessionId, paymentIntentId, amountTotal, currency });
        } else if (result.discountLimitExceeded) {
          bookingLog("stripe-webhook", "checkout.session.completed booking created, discount limit exceeded", { bookingId: result.bookingId, holdId });
          await writeEventResult(eventId, { status: "completed", processedAt: Timestamp.now(), outcome: "discount_exceeded_booking_created", bookingId: result.bookingId, holdId, sessionId, paymentIntentId, amountTotal, currency });
        } else {
          bookingLog("stripe-webhook", "checkout.session.completed booking created", { bookingId: result.bookingId, holdId });
          await writeEventResult(eventId, { status: "completed", processedAt: Timestamp.now(), outcome: "booking_created", bookingId: result.bookingId, holdId, sessionId, paymentIntentId, amountTotal, currency });
        }
        const stripeCouponId = (hold as { stripeCouponId?: string }).stripeCouponId;
        if (stripeCouponId) {
          stripe.coupons.del(stripeCouponId).catch((delErr) => {
            console.error("[stripe-webhook] checkout.session.completed failed to delete coupon after conversion", { holdId, stripeCouponId, error: delErr });
          });
        }
        return NextResponse.json({ received: true });
      } catch (convertErr) {
        const errMsg = convertErr instanceof Error ? convertErr.message : String(convertErr);
        bookingError("stripe-webhook", "checkout.session.completed convertHoldToBooking failed", convertErr, { holdId, sessionId, paymentIntentId, error: errMsg });
        await writeEventResult(eventId, { status: "failed_retryable", processedAt: Timestamp.now(), error: errMsg, holdId, sessionId, paymentIntentId, amountTotal, currency });
        return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
      }
    }
    if (event.type === "payment_intent.succeeded") {
      const piRaw = event.data.object as Stripe.PaymentIntent;
      const piId = piRaw.id;
      const piAmountTotal = piRaw.amount ?? undefined;
      const piCurrency = piRaw.currency ?? undefined;
      const paymentStage = piRaw.metadata?.payment_stage;
      const holdIdFromMeta = piRaw.metadata?.holdId;
      bookingLog("stripe-webhook", "payment_intent.succeeded", {
        eventIdPrefix: eventId.slice(0, 8),
        paymentStage: paymentStage ?? null,
        paymentIntentIdPrefix: piId.slice(0, 8),
        holdId: holdIdFromMeta ?? null,
      });

      if (paymentStage === "final") {
        const bookingId = piRaw.metadata?.bookingId;
        if (!bookingId) {
          console.error("[stripe-webhook] payment_intent.succeeded final missing bookingId");
          await writeEventResult(eventId, { status: "failed_retryable", processedAt: Timestamp.now(), error: "Missing bookingId for final", paymentIntentId: piId, amountTotal: piAmountTotal, currency: piCurrency });
          return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
        }
        const bookingRef = db.collection("bookings").doc(bookingId);
        const bookingSnap = await bookingRef.get();
        if (!bookingSnap.exists) {
          console.error("[stripe-webhook] payment_intent.succeeded final booking not found", { bookingId });
          await writeEventResult(eventId, { status: "failed_retryable", processedAt: Timestamp.now(), error: "Booking not found", bookingId, paymentIntentId: piId });
          return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
        }
        const bookingData = bookingSnap.data() as { status?: string; stripe?: { finalPaymentIntentId?: string } };
        const existingFinalPiId = bookingData.stripe?.finalPaymentIntentId;
        if (bookingData.status === "final_paid" && existingFinalPiId && existingFinalPiId !== piId) {
          try {
            await db.collection("pendingRefunds").add({
              bookingId,
              duplicatePaymentIntentId: piId,
              expectedPaymentIntentId: existingFinalPiId,
              reason: "duplicate_final_charge",
              status: "pending",
              createdAt: Timestamp.now(),
            });
            console.warn("[stripe-webhook] Duplicate final charge flagged for refund", { bookingId, duplicatePaymentIntentId: piId, expectedPaymentIntentId: existingFinalPiId });
          } catch (refundFlagErr) {
            console.error("[stripe-webhook] Failed to write pendingRefunds for duplicate final charge", refundFlagErr);
          }
          await writeEventResult(eventId, { status: "completed", processedAt: Timestamp.now(), outcome: "duplicate_final_flagged", bookingId, paymentIntentId: piId, amountTotal: piAmountTotal, currency: piCurrency });
          return NextResponse.json({ received: true });
        }
        if (bookingData.status === "final_paid" && existingFinalPiId === piId) {
          await writeEventResult(eventId, { status: "completed", processedAt: Timestamp.now(), outcome: "final_paid_idempotent", bookingId, paymentIntentId: piId, amountTotal: piAmountTotal, currency: piCurrency });
          return NextResponse.json({ received: true });
        }
        await bookingRef.update({
          status: "final_paid",
          "stripe.finalPaymentIntentId": piId,
          "stripe.finalChargedAt": Timestamp.now(),
          "stripe.finalError": FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        console.log("[stripe-webhook] payment_intent.succeeded final_paid", { bookingId });
        await writeEventResult(eventId, { status: "completed", processedAt: Timestamp.now(), outcome: "final_paid", bookingId, paymentIntentId: piId, amountTotal: piAmountTotal, currency: piCurrency });
        return NextResponse.json({ received: true });
      }

      const holdId = piRaw.metadata?.holdId;
      if (!holdId && !paymentStage) {
        await writeEventResult(eventId, { status: "completed", processedAt: Timestamp.now(), outcome: "skipped_no_booking_metadata", paymentIntentId: piId, amountTotal: piAmountTotal, currency: piCurrency });
        return NextResponse.json({ received: true });
      }
      if (!holdId) {
        bookingError("stripe-webhook", "payment_intent.succeeded missing holdId in metadata (permanent; no retry)", null, { paymentIntentId: piId });
        await writeEventResult(eventId, { status: "failed_permanent", processedAt: Timestamp.now(), error: "Missing holdId in metadata", paymentIntentId: piId, amountTotal: piAmountTotal, currency: piCurrency });
        return NextResponse.json({ received: true });
      }
      bookingLog("stripe-webhook", "payment_intent.succeeded resolving PI and calling convertHoldToBooking", { holdId, paymentIntentIdPrefix: piId.slice(0, 8) });

      const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["payment_method"] });
      const pm = pi.payment_method as Stripe.PaymentMethod | null;
      let card: BookingCardDisplay | undefined;
      if (pm && typeof pm === "object" && pm.card && typeof pm.card === "object") {
        const c = pm.card as { brand?: string; last4?: string; exp_month?: number; exp_year?: number };
        card = {
          brand: c.brand,
          last4: c.last4,
          expMonth: c.exp_month,
          expYear: c.exp_year,
        };
      }
      const customerId = typeof pi.customer === "string" ? pi.customer : pi.customer?.id;
      const paymentMethodId = typeof pm === "object" && pm?.id ? pm.id : undefined;

      const totalCentsFromMeta = parseInt(pi.metadata?.totalCents ?? "0", 10) || 0;
      const depositCentsFromMeta = parseInt(pi.metadata?.depositCents ?? "0", 10) || 0;
      const amountCharged = piAmountTotal ?? 0;
      // When metadata total is missing/0, use hold pricing so we don't treat deposit amount as full total (which would wrongly classify as full payment)
      let totalCents: number;
      if (totalCentsFromMeta > 0) {
        totalCents = totalCentsFromMeta;
      } else {
        const holdRef = db.collection("holds").doc(holdId);
        const holdSnap = await holdRef.get();
        const hold = holdSnap.exists ? (holdSnap.data() as { pricing?: { totalCents?: number }; tipCents?: number; discountCents?: number }) : null;
        if (hold?.pricing && typeof hold.pricing.totalCents === "number") {
          const tipCents = typeof hold.tipCents === "number" ? hold.tipCents : 0;
          const discountCents = typeof hold.discountCents === "number" ? hold.discountCents : 0;
          totalCents = Math.max(0, hold.pricing.totalCents + tipCents - discountCents);
          bookingLog("stripe-webhook", "payment_intent.succeeded using hold pricing for total (metadata total missing)", { holdId, totalCents, amountCharged });
        } else {
          totalCents = amountCharged;
        }
      }
      const finalCents = parseInt(pi.metadata?.finalCents ?? "0", 10) || Math.max(0, totalCents - (depositCentsFromMeta || amountCharged));
      // Treat as deposit when: metadata says "deposit", or amount charged is less than full total (fallback); do NOT require customerId
      const isDepositByStage = paymentStage === "deposit";
      const isDepositByAmount = totalCents > 0 && amountCharged > 0 && amountCharged < totalCents;
      const useDepositInput = isDepositByStage || (paymentStage !== "full" && paymentStage !== "final" && isDepositByAmount);

      const convertInput: ConvertHoldInput =
        useDepositInput
          ? ({
              paymentStage: "deposit",
              paymentIntentId: piId,
              amountTotalCents: amountCharged,
              currency: piCurrency,
              stripe: {
                ...(customerId && { customerId }),
                ...(paymentMethodId && { paymentMethodId }),
                ...(card && { card }),
                totalCents,
                depositCents: amountCharged,
                finalCents: Math.max(0, totalCents - amountCharged),
              },
            } as ConvertHoldInputDeposit)
          : {
              paymentIntentId: piId,
              amountTotalCents: piAmountTotal,
              currency: piCurrency,
            };

      try {
        const result = await convertHoldToBooking(db, holdId, convertInput);
        if ("alreadyConverted" in result) {
          bookingLog("stripe-webhook", "payment_intent.succeeded hold already converted", { holdId, paymentIntentIdPrefix: piId.slice(0, 8) });
          await writeEventResult(eventId, { status: "completed", processedAt: Timestamp.now(), outcome: "already_converted", holdId, paymentIntentId: piId, amountTotal: piAmountTotal, currency: piCurrency });
        } else if (result.discountLimitExceeded) {
          bookingLog("stripe-webhook", "payment_intent.succeeded booking created, discount limit exceeded", { bookingId: result.bookingId, holdId });
          await writeEventResult(eventId, { status: "completed", processedAt: Timestamp.now(), outcome: "discount_exceeded_booking_created", bookingId: result.bookingId, holdId, paymentIntentId: piId, amountTotal: piAmountTotal, currency: piCurrency });
        } else {
          bookingLog("stripe-webhook", "payment_intent.succeeded booking created", { bookingId: result.bookingId, holdId });
          await writeEventResult(eventId, { status: "completed", processedAt: Timestamp.now(), outcome: "booking_created", bookingId: result.bookingId, holdId, paymentIntentId: piId, amountTotal: piAmountTotal, currency: piCurrency });
        }
        return NextResponse.json({ received: true });
      } catch (convertErr) {
        const errMsg = convertErr instanceof Error ? convertErr.message : String(convertErr);
        if (errMsg === "Hold has expired") {
          try {
            await db.collection("pendingRefunds").add({
              holdId,
              duplicatePaymentIntentId: piId,
              reason: "hold_expired_after_payment",
              status: "pending",
              createdAt: Timestamp.now(),
            });
          } catch (refundFlagErr) {
            console.error("[stripe-webhook] Failed to write pendingRefunds for hold expired", refundFlagErr);
          }
          console.warn("[stripe-webhook] Hold expired after successful payment — flagged for refund", { holdId, paymentIntentId: piId });
          await writeEventResult(eventId, { status: "completed", processedAt: Timestamp.now(), outcome: "hold_expired_refund_flagged", holdId, paymentIntentId: piId, amountTotal: piAmountTotal, currency: piCurrency });
          return NextResponse.json({ received: true });
        } else {
          bookingError("stripe-webhook", "payment_intent.succeeded convertHoldToBooking failed", convertErr, { holdId, paymentIntentId: piId, error: errMsg });
          await writeEventResult(eventId, { status: "failed_retryable", processedAt: Timestamp.now(), error: errMsg, holdId, paymentIntentId: piId, amountTotal: piAmountTotal, currency: piCurrency });
        }
        return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const piId = pi.id;
      const paymentStage = pi.metadata?.payment_stage;
      const lastError = pi.last_payment_error as { code?: string; message?: string } | null;
      console.log("[stripe-webhook] payment_intent.payment_failed", { eventId, paymentStage, code: lastError?.code });
      if (paymentStage === "final") {
        const bookingId = pi.metadata?.bookingId;
        if (bookingId) {
          const requiresAction =
            lastError?.code === "authentication_required" ||
            lastError?.code === "card_authentication_required" ||
            (typeof lastError?.message === "string" && lastError.message.toLowerCase().includes("authenticate"));
          const newStatus = requiresAction ? "final_requires_action" : "final_failed";
          // Fetch before update so we have customer data without an extra round-trip after
          const bookingRef = db.collection("bookings").doc(bookingId);
          const bookingSnap = await bookingRef.get();
          await bookingRef.update({
            status: newStatus,
            "stripe.finalError": { code: lastError?.code ?? undefined, message: lastError?.message ?? undefined },
            "stripe.finalChargeAttemptedAt": Timestamp.now(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          console.log("[stripe-webhook] payment_intent.payment_failed booking updated", { bookingId, newStatus });
          try {
            if (bookingSnap.exists) {
              const b = bookingSnap.data() as Booking;
              let manageLink: string | undefined;
              if (bookingEnv.manageBookingSecret) {
                try {
                  const token = signManageToken({
                  bookingId,
                  customerEmail: b.customer?.email,
                  tripDateStr: b.startDateStr,
                });
                  manageLink = `${bookingEnv.appBaseUrl}/booking/manage?token=${encodeURIComponent(token)}`;
                } catch (_) {
                  // MANAGE_BOOKING_SECRET not set
                }
              }
              await sendFinalChargeFailedEmail(b.customer.email, b.customer.name, manageLink, requiresAction);
            }
          } catch (emailErr) {
            console.error("[stripe-webhook] final charge failed email error", emailErr);
          }
        }
      }
      await writeEventResult(eventId, { status: "completed", processedAt: Timestamp.now(), outcome: "payment_failed_handled" });
    }

    await writeEventResult(eventId, { status: "completed", processedAt: Timestamp.now() });
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe-webhook]", err);
    const ev = event;
    const stripeEventId = ev?.id;
    if (stripeEventId) {
      try {
        const db = getDb();
        const { Timestamp } = getFirestoreExports();
        const obj = ev?.data?.object as unknown as Record<string, unknown> | undefined;
        const payload: Record<string, unknown> = {
          status: "failed_retryable",
          processedAt: Timestamp.now(),
          error: err instanceof Error ? err.message : String(err),
        };
        if (ev?.type === "checkout.session.completed" && obj) {
          if (obj.id) payload.sessionId = obj.id;
          const pi = obj.payment_intent;
          if (typeof pi === "string") payload.paymentIntentId = pi;
          else if (pi && typeof pi === "object" && typeof (pi as { id?: string }).id === "string") payload.paymentIntentId = (pi as { id: string }).id;
          if (typeof obj.amount_total === "number") payload.amountTotal = obj.amount_total;
          if (typeof obj.currency === "string") payload.currency = obj.currency;
        } else if (ev?.type === "payment_intent.succeeded" && obj) {
          if (obj.id) payload.paymentIntentId = obj.id;
          if (typeof obj.amount === "number") payload.amountTotal = obj.amount;
          if (typeof obj.currency === "string") payload.currency = obj.currency;
        } else if (obj?.id) {
          payload.paymentIntentId = obj.id;
          if (typeof obj.amount === "number") payload.amountTotal = obj.amount;
          if (typeof obj.currency === "string") payload.currency = obj.currency;
        }
        await db.collection("stripeEvents").doc(stripeEventId).set(payload, { merge: true });
      } catch (_) {
        // ignore
      }
    }
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
