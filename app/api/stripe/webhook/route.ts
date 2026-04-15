import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

/** Netlify Pro max serverless duration; webhook conversion must finish or stripeEvents may stall mid-flight. */
export const maxDuration = 26;
import { getStripe } from "@/lib/booking/stripe-client";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import {
  sendAmountIntegrityMismatchCustomerEmail,
  sendAmountIntegrityMismatchOpsEmail,
  sendFinalChargeFailedEmail,
  upsertBrevoContact,
} from "@/lib/booking/brevo";
import { logEmailSent } from "@/lib/booking/email-log";
import { buildAddonSelectionsForPricing, computePricing, getEffectiveRatePriceCents } from "@/lib/booking/pricing";
import { bookingEnv, validateWebhookEnv } from "@/lib/booking/env";
import {
  convertHoldToBooking,
  isBookingBlockedByOperatorError,
} from "@/lib/booking/convert-hold-to-booking";
import { BlockCheckUnavailableError } from "@/lib/booking/has-overlapping-block";
import { LegacyScanLimitReachedError } from "@/lib/booking/slot-availability";
import { resetBookingSlotsToOpenInTransaction } from "@/lib/booking/slot-reset";
import type { Booking, Hold, Slot, Boat, Rate, Addon, FirestoreTimestamp } from "@/lib/booking/types";
import type { Experience, ExperienceRate, ExperienceAddon, BoatRate, ListingBoat } from "@/lib/booking/types";
import { signManageToken } from "@/lib/booking/manageToken";
import { DEFAULT_CANCELLATION_POLICY } from "@/lib/booking/cancellation-policy";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
import { getDepartureInventoryRef, checkCapacityAndRelease } from "@/lib/booking/shared-departure-inventory";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { formatSlotDateTime } from "@/lib/booking/format-booking-datetime";
import {
  checkoutIncomingMismatchAgainstHold,
  customerOverrideFromCheckoutSession,
  customerOverrideFromPaymentIntent,
  patchBookingCustomerIfPlaceholderFromCheckoutSession,
  paymentIntentMatchesHoldForConversion,
} from "@/lib/booking/stripe-payment-intent-convert";
import { ResolveAndConvertPaymentError, resolveAndConvertPayment } from "@/lib/booking/resolve-and-convert-payment";
import { sendBookingConfirmationCopyToBusiness } from "@/lib/booking/brevo";
import {
  tryBeginFinalFailureNotificationSend,
  finalizeFinalFailureNotification,
  clearFinalFailureNotificationLease,
} from "@/lib/booking/final-failure-dedupe";
import { logNotificationSent } from "@/lib/booking/email-log";
import { bookingLog, bookingWarn, bookingError } from "@/lib/booking/debug";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { upsertPendingRefundRecord } from "@/lib/booking/pending-refund-idempotent";
import { transitionToFinalPaid } from "@/lib/booking/final-paid-transition";
import { resolveFinalBalanceFromBooking } from "@/lib/booking/final-balance-resolver";
import { resolveExperienceDocAndSlug } from "@/lib/booking/listing-boat-resolution";
import { runExpiredHoldReleaseTransaction } from "@/lib/booking/cleanup-holds-logic";
import { executeFinalFailedBookingReleaseTransaction } from "@/lib/booking/release-hold-transaction";
import type { BookingStatus } from "@/lib/booking/types";
import {
  incrementStripeWebhookRetryCounter,
  webhookTransientFailureShouldRetry,
  WH_RETRY_ASYNC_CHECKOUT_CONVERT_ERR,
  WH_RETRY_ASYNC_CHECKOUT_HOLD_NOT_FOUND,
  WH_RETRY_ASYNC_CHECKOUT_MISSING_HOLD_ID,
  WH_RETRY_ASYNC_CONVERTED_HOLD_NO_PI,
  WH_RETRY_ASYNC_PAYMENT_NOT_PAID,
  WH_RETRY_CHECKOUT_ACTIVE_HOLD_CONVERT_ERR,
  WH_RETRY_CHECKOUT_ACTIVE_HOLD_HOLD_NOT_ACTIVE,
  WH_RETRY_CHECKOUT_ACTIVE_HOLD_HOLD_NOT_FOUND,
  WH_RETRY_CHECKOUT_ACTIVE_HOLD_NO_HOLD_ID,
  WH_RETRY_CHECKOUT_ACTIVE_HOLD_NO_PI,
  WH_RETRY_CHECKOUT_COMPLETED_HOLD_NOT_FOUND,
  WH_RETRY_CHECKOUT_COMPLETED_NO_PI,
  WH_RETRY_FINAL_BOOKING_DOC_NOT_FOUND,
  WH_RETRY_FINAL_PI_MISSING_BOOKING_ID,
  WH_RETRY_PI_SUCCEEDED_CONVERT_ERR,
  WH_RETRY_PI_SUCCEEDED_HOLD_MISSING,
  STRIPE_WEBHOOK_PI_HOLD_MISSING_RETRY_THRESHOLD,
} from "@/lib/booking/webhook/stripe-webhook-retry";

/** Booking statuses that may transition to final_paid via final-stage PaymentIntent webhook. */
const FINAL_PAYMENT_ACTIVE_STATUSES = new Set<BookingStatus>([
  "final_due",
  "final_processing",
  "final_requires_action",
  "final_failed",
]);

/** Non-blocking: idempotent checkout paths may skip coupon delete on hold; clean up after placeholder patch. */
function deleteStripeCouponFromHoldIfSet(stripe: Stripe, hold: Hold, holdId: string): void {
  const stripeCouponId = (hold as { stripeCouponId?: string }).stripeCouponId;
  if (stripeCouponId) {
    stripe.coupons.del(stripeCouponId).catch((delErr) => {
      console.error("[stripe-webhook] failed to delete coupon after idempotent customer patch", {
        holdId,
        stripeCouponId,
        error: delErr,
      });
    });
  }
}

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
    /** Bumps per-path retry counters on `stripeEvents/{eventId}`; use with `webhookTransientFailureShouldRetry`. */
    const recordWebhookRetryAttempt = (counterField: string) =>
      incrementStripeWebhookRetryCounter(db, eventsRef, eventId, counterField);
    /** 5 minutes aligns with Netlify max serverless duration so a slow handler is less likely to overlap a stale-lease reclaim retry. */
    const PROCESSING_LEASE_MS = 5 * 60 * 1000;

    type ClaimResult = { runHandler: boolean; alreadyCompleted: boolean; reclaimedStale?: boolean; needsCustomerPatch?: boolean };
    const claimResult = await db.runTransaction(async (tx): Promise<ClaimResult> => {
      const ref = eventsRef.doc(eventId);
      const d = await tx.get(ref);
      const now = Timestamp.now();
      if (d.exists) {
        const data = d.data() as {
          status?: string;
          receivedAt?: { toDate(): Date };
          leaseExpiresAt?: { toDate(): Date };
          eventType?: string;
          outcome?: string;
        };
        if (data.status === "completed") {
          const outcome = data.outcome;
          const requiresConversionCustomerPatch =
            typeof outcome === "string" &&
            (outcome.includes("_already_converted") ||
              outcome.includes("_booking_created") ||
              outcome.includes("_hold_converted_idempotent") ||
              outcome.includes("duplicate_checkout_flagged_refund") ||
              outcome.includes("_expired_hold_refund_required"));
          return {
            runHandler: false,
            alreadyCompleted: true,
            needsCustomerPatch:
              (data as { customerPatched?: boolean }).customerPatched !== true &&
              event!.type.startsWith("checkout.session.") &&
              requiresConversionCustomerPatch,
          };
        }
        if (data.status === "processing") {
          const leaseExpiresAt = data.leaseExpiresAt?.toDate?.();
          const stale = leaseExpiresAt && leaseExpiresAt.getTime() < Date.now();
          if (!stale) return { runHandler: false, alreadyCompleted: false };
          // Stale lease: reclaim so we process this delivery instead of silently dropping
          bookingLog("stripe-webhook", "event processing lease exceeded, reclaiming", {
            eventId,
            eventType: data.eventType ?? event!.type,
            leaseExceededAt: leaseExpiresAt?.toISOString?.(),
          });
          const newLeaseExpiresAt = Timestamp.fromDate(new Date(Date.now() + PROCESSING_LEASE_MS));
          tx.set(ref, { status: "processing", eventType: event!.type, receivedAt: data.receivedAt ?? now, leaseExpiresAt: newLeaseExpiresAt, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          return { runHandler: true, alreadyCompleted: false, reclaimedStale: true };
        }
        // failed_retryable or other: reclaim so a retry can process
        const newLeaseExpiresAt = Timestamp.fromDate(new Date(Date.now() + PROCESSING_LEASE_MS));
        tx.set(ref, { status: "processing", eventType: event!.type, receivedAt: data.receivedAt ?? now, leaseExpiresAt: newLeaseExpiresAt, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return { runHandler: true, alreadyCompleted: false };
      }
      const leaseExpiresAt = Timestamp.fromDate(new Date(Date.now() + PROCESSING_LEASE_MS));
      const expireAt = Timestamp.fromDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
      tx.set(ref, {
        receivedAt: now,
        status: "processing",
        eventType: event!.type,
        leaseExpiresAt,
        updatedAt: FieldValue.serverTimestamp(),
        expireAt,
      });
      return { runHandler: true, alreadyCompleted: false };
    });

    bookingLog("stripe-webhook", "event received", { eventId, eventType: event.type });
    if (claimResult.alreadyCompleted) {
      if (claimResult.needsCustomerPatch) {
        bookingLog("stripe-webhook", "event already completed; retrying customer placeholder patch", {
          eventId,
          eventType: event.type,
        });
        if (event.type.startsWith("checkout.session.")) {
          const session = event.data.object as Stripe.Checkout.Session;
          const holdId = typeof session.metadata?.holdId === "string" ? session.metadata?.holdId.trim() : undefined;
          const paymentIntentId =
            typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? undefined;
          if (holdId) {
            let customerPatched = false;
            try {
              customerPatched = await patchBookingCustomerIfPlaceholderFromCheckoutSession(db, holdId, session, Timestamp.now());
            } catch (patchErr) {
              const lastError = patchErr instanceof Error ? patchErr.message : String(patchErr);
              await writeOperationalAlert({
                type: "stripe_webhook_customer_patch_failed",
                source: "stripe-webhook",
                holdId,
                sessionId: session.id,
                paymentIntentId,
                lastError: lastError.slice(0, 500),
              });
              customerPatched = false;
            }
            await eventsRef.doc(eventId).set(
              { customerPatched, updatedAt: FieldValue.serverTimestamp() },
              { merge: true }
            );
            if (!customerPatched) {
              return NextResponse.json(
                { error: "Customer email placeholder patch incomplete; Stripe will retry" },
                { status: 500 }
              );
            }
          } else {
            // Avoid infinite 5xx loops if we can't correlate to a hold.
            await eventsRef.doc(eventId).set(
              { customerPatched: true, updatedAt: FieldValue.serverTimestamp() },
              { merge: true }
            );
          }
          return NextResponse.json({ received: true });
        }
      }
      bookingLog("stripe-webhook", "event already completed, skipping", { eventId });
      return NextResponse.json({ received: true });
    }
    if (!claimResult.runHandler) {
      bookingLog("stripe-webhook", "event processing in progress or lease held; returning non-2xx so Stripe retries", { eventId, eventType: event.type });
      // Do not mutate the event doc: leave status "processing" and lease active so concurrent deliveries
      // cannot both run the handler; stale-lease reclamation handles crashes.
      return NextResponse.json({ error: "Event processing in progress; Stripe will retry" }, { status: 503 });
    }
    if (claimResult.reclaimedStale) {
      bookingLog("stripe-webhook", "event recovered from stale processing (lease exceeded)", {
        eventId,
        eventType: event.type,
        metric: "stripe_webhook_stale_reclaimed",
      });
      await new Promise<void>((resolve) => {
        setTimeout(resolve, Math.random() * 2000);
      });
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
        customerPatched?: boolean;
        amountReceived?: number | null;
        partialRefundQueued?: boolean;
      }
    ) => {
      await eventsRef.doc(docId).set(
        {
          ...data,
          webhookHandlerResultWriteCount: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
          leaseExpiresAt: FieldValue.delete(),
        },
        { merge: true }
      );
    };

    const rejectStaleCheckoutIds = async (
      evId: string,
      holdId: string,
      hold: Hold,
      session: Stripe.Checkout.Session,
      sessionId: string,
      paymentIntentId: string | undefined,
      amountTotal: number | undefined,
      currency: string | undefined,
      outcome: string
    ) => {
      try {
        await upsertPendingRefundRecord(
          db,
          {
            reason: "checkout_webhook_stale_or_mismatched_ids",
            holdId,
            sessionId,
            paymentIntentId: paymentIntentId ?? null,
          },
          {
            holdId,
            sessionId,
            paymentIntentId,
            amountTotal,
            currency,
            mismatchOutcome: outcome,
            ...(hold.customerDraft?.email && { customerEmail: hold.customerDraft.email }),
          }
        );
      } catch (e) {
        console.error("[stripe-webhook] pendingRefunds for stale/mismatched checkout ids", e);
      }
      await writeOperationalAlert({
        type: "checkout_webhook_stale_or_mismatched_ids",
        holdId,
        sessionId,
        paymentIntentId,
        source: "stripe-webhook",
        outcome,
      });
      let customerPatched = false;
      try {
        customerPatched = await patchBookingCustomerIfPlaceholderFromCheckoutSession(db, holdId, session, Timestamp.now());
      } catch (patchErr) {
        const lastError = patchErr instanceof Error ? patchErr.message : String(patchErr);
        await writeOperationalAlert({
          type: "stripe_webhook_customer_patch_failed",
          source: "stripe-webhook",
          holdId,
          sessionId,
          paymentIntentId,
          lastError: lastError.slice(0, 500),
        });
        customerPatched = false;
      }
      await writeEventResult(evId, {
        status: "completed",
        processedAt: Timestamp.now(),
        outcome,
        error: "Stale or mismatched Stripe session/payment intent vs hold authoritative ids",
        holdId,
        sessionId,
        paymentIntentId,
        amountTotal,
        currency,
        customerPatched,
      });
      return customerPatched;
    };

    /** Active-hold Checkout Session → booking conversion (guard PI vs hold, convert, coupon, patch customer). */
    const runCheckoutSessionActiveHoldConversion = async (
      session: Stripe.Checkout.Session,
      evId: string,
      outcomePrefix: string
    ): Promise<boolean> => {
      const sessionId = session.id;
      const paymentIntentId =
        typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? undefined;
      const amountTotal = session.amount_total ?? undefined;
      const currency = session.currency ?? undefined;
      const holdId = session.metadata?.holdId;
      if (!holdId) {
        const attempt = await recordWebhookRetryAttempt(WH_RETRY_CHECKOUT_ACTIVE_HOLD_NO_HOLD_ID);
        if (webhookTransientFailureShouldRetry(attempt)) {
          await writeEventResult(evId, {
            status: "failed_retryable",
            processedAt: Timestamp.now(),
            error: "Missing holdId in session metadata",
            sessionId,
            paymentIntentId,
            amountTotal,
            currency,
          });
          return false;
        }
        try {
          await upsertPendingRefundRecord(
            db,
            {
              reason: "checkout_active_hold_missing_hold_id_dead_letter",
              sessionId,
              paymentIntentId: paymentIntentId ?? null,
            },
            { sessionId, paymentIntentId, amountTotal, currency }
          );
        } catch (e) {
          console.error("[stripe-webhook] pendingRefunds checkout_active_hold_missing_hold_id_dead_letter", e);
        }
        await writeOperationalAlert({
          type: "checkout_active_hold_missing_hold_id_dead_letter",
          sessionId,
          paymentIntentId,
          source: "stripe-webhook",
          attempt,
        });
        await writeEventResult(evId, {
          status: "failed_permanent",
          processedAt: Timestamp.now(),
          outcome: "checkout_active_hold_missing_hold_id_dead_letter",
          error: "Missing holdId in session metadata",
          sessionId,
          paymentIntentId,
          amountTotal,
          currency,
        });
        return true;
      }
      const holdRef = db.collection("holds").doc(holdId);
      const holdSnap = await holdRef.get();
      if (!holdSnap.exists) {
        const attempt = await recordWebhookRetryAttempt(WH_RETRY_CHECKOUT_ACTIVE_HOLD_HOLD_NOT_FOUND);
        if (webhookTransientFailureShouldRetry(attempt)) {
          await writeEventResult(evId, {
            status: "failed_retryable",
            processedAt: Timestamp.now(),
            error: "Hold not found",
            holdId,
            sessionId,
            paymentIntentId,
            amountTotal,
            currency,
          });
          return false;
        }
        try {
          await upsertPendingRefundRecord(
            db,
            {
              reason: "checkout_active_hold_hold_not_found_dead_letter",
              holdId,
              sessionId,
              paymentIntentId: paymentIntentId ?? null,
            },
            { holdId, sessionId, paymentIntentId, amountTotal, currency }
          );
        } catch (e) {
          console.error("[stripe-webhook] pendingRefunds checkout_active_hold_hold_not_found_dead_letter", e);
        }
        await writeOperationalAlert({
          type: "checkout_active_hold_hold_not_found_dead_letter",
          holdId,
          sessionId,
          paymentIntentId,
          source: "stripe-webhook",
          attempt,
        });
        await writeEventResult(evId, {
          status: "failed_permanent",
          processedAt: Timestamp.now(),
          outcome: "checkout_active_hold_hold_not_found_dead_letter",
          error: "Hold not found",
          holdId,
          sessionId,
          paymentIntentId,
          amountTotal,
          currency,
        });
        return true;
      }
      const hold = holdSnap.data() as Hold;
      if (hold.status !== "active") {
        const attempt = await recordWebhookRetryAttempt(WH_RETRY_CHECKOUT_ACTIVE_HOLD_HOLD_NOT_ACTIVE);
        if (webhookTransientFailureShouldRetry(attempt)) {
          await writeEventResult(evId, {
            status: "failed_retryable",
            processedAt: Timestamp.now(),
            error: "Hold not active for conversion",
            holdId,
            sessionId,
            paymentIntentId,
            amountTotal,
            currency,
          });
          return false;
        }
        try {
          await upsertPendingRefundRecord(
            db,
            {
              reason: "checkout_active_hold_hold_not_active_dead_letter",
              holdId,
              sessionId,
              paymentIntentId: paymentIntentId ?? null,
            },
            { holdId, sessionId, paymentIntentId, amountTotal, currency }
          );
        } catch (e) {
          console.error("[stripe-webhook] pendingRefunds checkout_active_hold_hold_not_active_dead_letter", e);
        }
        await writeOperationalAlert({
          type: "checkout_active_hold_hold_not_active_dead_letter",
          holdId,
          sessionId,
          paymentIntentId,
          source: "stripe-webhook",
          attempt,
        });
        await writeEventResult(evId, {
          status: "failed_permanent",
          processedAt: Timestamp.now(),
          outcome: "checkout_active_hold_hold_not_active_dead_letter",
          error: "Hold not active for conversion",
          holdId,
          sessionId,
          paymentIntentId,
          amountTotal,
          currency,
        });
        return true;
      }
      if (!paymentIntentId) {
        const attempt = await recordWebhookRetryAttempt(WH_RETRY_CHECKOUT_ACTIVE_HOLD_NO_PI);
        if (webhookTransientFailureShouldRetry(attempt)) {
          await writeEventResult(evId, {
            status: "failed_retryable",
            processedAt: Timestamp.now(),
            error: "Missing payment_intent",
            holdId,
            sessionId,
            amountTotal,
            currency,
          });
          return false;
        }
        try {
          await upsertPendingRefundRecord(
            db,
            {
              reason: "checkout_active_hold_missing_pi_dead_letter",
              holdId,
              sessionId,
              paymentIntentId: null,
            },
            { holdId, sessionId, amountTotal, currency }
          );
        } catch (e) {
          console.error("[stripe-webhook] pendingRefunds checkout_active_hold_missing_pi_dead_letter", e);
        }
        await writeOperationalAlert({
          type: "checkout_active_hold_missing_pi_dead_letter",
          holdId,
          sessionId,
          source: "stripe-webhook",
          attempt,
        });
        await writeEventResult(evId, {
          status: "failed_permanent",
          processedAt: Timestamp.now(),
          outcome: "checkout_active_hold_missing_pi_dead_letter",
          error: "Missing payment_intent",
          holdId,
          sessionId,
          amountTotal,
          currency,
        });
        return true;
      }
      const piActiveGuard = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["payment_method"] });
      const holdPricingActive = {
        pricing: hold.pricing,
        tipCents: hold.tipCents,
        discountCents: hold.discountCents,
      };
      const activeGuard = checkoutIncomingMismatchAgainstHold(
        sessionId,
        paymentIntentId,
        piActiveGuard,
        {
          checkoutSessionId: hold.checkoutSessionId,
          depositPaymentIntentId: hold.depositPaymentIntentId,
          fullPaymentIntentId: hold.fullPaymentIntentId,
          paymentAttemptVersion: (hold as { paymentAttemptVersion?: number }).paymentAttemptVersion,
        },
        holdPricingActive
      );
      if (!activeGuard.ok) {
        const customerPatchedOk = await rejectStaleCheckoutIds(
          evId,
          holdId,
          hold,
          session,
          sessionId,
          paymentIntentId,
          amountTotal,
          currency,
          activeGuard.reason === "checkout_session_id_mismatch"
            ? `${outcomePrefix}_checkout_session_id_mismatch`
            : `${outcomePrefix}_payment_intent_mismatch_hold`
        );
        if (!customerPatchedOk) {
          return false;
        }
        return true;
      }
      const customerOverride = customerOverrideFromCheckoutSession(session, hold.customerDraft);
      let specialNotesOverride: string | undefined;
      if (Array.isArray(session.custom_fields)) {
        const field = session.custom_fields.find((f: { key?: string }) => f.key === "special_notes");
        const v = field && (field as { value?: string | { value?: string } }).value;
        specialNotesOverride =
          typeof v === "string"
            ? v.trim() || undefined
            : typeof v === "object" && v?.value != null
              ? String(v.value).trim() || undefined
              : undefined;
      }
      try {
        const conversion = await resolveAndConvertPayment(db, {
          paymentIntentId,
          holdId,
          amountTotalCents: amountTotal,
          currency,
          source: "checkout_webhook",
          paymentIntent: piActiveGuard,
          ...(customerOverride ? { customerOverride } : {}),
          specialNotes: specialNotesOverride,
          checkoutSessionId: sessionId,
        });
        const result = conversion.result;
        if ("amountIntegrityMismatch" in result) {
          await writeOperationalAlert({
            type: "stripe_webhook_amount_integrity_mismatch",
            holdId,
            paymentIntentId,
            sessionId,
            source: `stripe-webhook_${outcomePrefix}_amount_integrity`,
          });
          try {
            await sendAmountIntegrityMismatchOpsEmail({
              holdId,
              paymentIntentId,
              source: `stripe-webhook_${outcomePrefix}_amount_integrity`,
            });
          } catch (e) {
            console.error("[stripe-webhook] sendAmountIntegrityMismatchOpsEmail", e);
          }
          const em = (customerOverride?.email ?? hold.customerDraft.email)?.trim();
          if (em) {
            try {
              await sendAmountIntegrityMismatchCustomerEmail({
                to: em,
                customerName:
                  customerOverride?.name?.trim() || hold.customerDraft.name?.trim() || "Guest",
                holdId,
              });
            } catch (e) {
              console.error("[stripe-webhook] sendAmountIntegrityMismatchCustomerEmail", e);
            }
          }
          await writeEventResult(evId, {
            status: "completed",
            processedAt: Timestamp.now(),
            outcome: `${outcomePrefix}_amount_integrity_mismatch`,
            holdId,
            sessionId,
            paymentIntentId,
            amountTotal,
            currency,
          });
          return true;
        }
        // Patch placeholder checkout emails; if incomplete, mark event completed but force Stripe retry.
        let customerPatched = false;
        try {
          customerPatched = await patchBookingCustomerIfPlaceholderFromCheckoutSession(db, holdId, session, Timestamp.now());
        } catch (patchErr) {
          const lastError = patchErr instanceof Error ? patchErr.message : String(patchErr);
          await writeOperationalAlert({
            type: "stripe_webhook_customer_patch_failed",
            source: "stripe-webhook",
            holdId,
            sessionId,
            paymentIntentId,
            lastError: lastError.slice(0, 500),
          });
          customerPatched = false;
        }
        if ("alreadyConverted" in result) {
          bookingLog("stripe-webhook", "checkout session active-hold conversion (already converted)", {
            holdId,
            outcomePrefix,
            paymentIntentId,
          });
          await writeEventResult(evId, {
            status: "completed",
            processedAt: Timestamp.now(),
            outcome: `${outcomePrefix}_already_converted`,
            holdId,
            sessionId,
            paymentIntentId,
            amountTotal,
            currency,
            customerPatched,
          });
        } else {
          bookingLog("stripe-webhook", "checkout session active-hold conversion (booking created)", {
            bookingId: result.bookingId,
            holdId,
            outcomePrefix,
          });
          await writeEventResult(evId, {
            status: "completed",
            processedAt: Timestamp.now(),
            outcome: `${outcomePrefix}_booking_created`,
            bookingId: result.bookingId,
            holdId,
            sessionId,
            paymentIntentId,
            amountTotal,
            currency,
            customerPatched,
          });
        }
        deleteStripeCouponFromHoldIfSet(stripe, hold, holdId);
        if (!customerPatched) return false;
        return true;
      } catch (convertErr) {
        const errMsg = convertErr instanceof Error ? convertErr.message : String(convertErr);
        if (convertErr instanceof ResolveAndConvertPaymentError && convertErr.kind === "PI_MATCH_FAILED") {
          await writeEventResult(evId, {
            status: "failed_retryable",
            processedAt: Timestamp.now(),
            error: "PI_MATCH_FAILED",
            holdId,
            sessionId,
            paymentIntentId,
            amountTotal,
            currency,
          });
          return false;
        }
        if (convertErr instanceof BlockCheckUnavailableError || convertErr instanceof LegacyScanLimitReachedError) {
          await writeEventResult(evId, {
            status: "failed_retryable",
            processedAt: Timestamp.now(),
            error: "BLOCK_CHECK_UNAVAILABLE",
            holdId,
            sessionId,
            paymentIntentId,
            amountTotal,
            currency,
          });
          return false;
        }
        if (isBookingBlockedByOperatorError(convertErr)) {
          try {
            const customerEmail = hold.customerDraft?.email;
            await upsertPendingRefundRecord(
              db,
              {
                reason: "operator_date_blocked_at_conversion",
                holdId,
                paymentIntentId: paymentIntentId ?? null,
              },
              {
                holdId,
                paymentIntentId,
                amountTotal,
                currency,
                ...(customerEmail && { customerEmail }),
              }
            );
          } catch (refundFlagErr) {
            console.error("[stripe-webhook] pendingRefunds operator_date_blocked_at_conversion (active hold)", refundFlagErr);
          }
          await writeOperationalAlert({
            type: "stripe_webhook_operator_date_blocked_at_conversion",
            holdId,
            sessionId,
            paymentIntentId,
            source: "stripe-webhook",
            outcomePrefix,
          });
          await writeEventResult(evId, {
            status: "completed",
            processedAt: Timestamp.now(),
            outcome: `${outcomePrefix}_operator_date_blocked`,
            holdId,
            sessionId,
            paymentIntentId,
            amountTotal,
            currency,
          });
          return true;
        }
        if (errMsg === "Hold has expired") {
          try {
            const customerEmail = hold.customerDraft?.email;
            await upsertPendingRefundRecord(
              db,
              {
                reason: "hold_expired_after_checkout_payment",
                holdId,
                sessionId,
                paymentIntentId: paymentIntentId ?? null,
              },
              {
                holdId,
                sessionId,
                paymentIntentId,
                amountTotal,
                currency,
                ...(customerEmail && { customerEmail }),
              }
            );
          } catch (refundFlagErr) {
            console.error("[stripe-webhook] pendingRefunds hold_expired_after_checkout_payment (active hold conversion)", refundFlagErr);
          }
          await writeOperationalAlert({
            type: "hold_expired_after_checkout_payment",
            holdId,
            sessionId,
            paymentIntentId,
            source: "stripe-webhook",
            outcomePrefix,
          });
          await writeEventResult(evId, {
            status: "completed",
            processedAt: Timestamp.now(),
            outcome: "hold_expired_refund_flagged",
            error: errMsg,
            holdId,
            sessionId,
            paymentIntentId,
            amountTotal,
            currency,
          });
          return true;
        }
        bookingError("stripe-webhook", `${outcomePrefix} convertHoldToBooking failed`, convertErr, {
          holdId,
          sessionId,
          paymentIntentId,
          error: errMsg,
        });
        const attempt = await recordWebhookRetryAttempt(WH_RETRY_CHECKOUT_ACTIVE_HOLD_CONVERT_ERR);
        if (webhookTransientFailureShouldRetry(attempt)) {
          await writeEventResult(evId, {
            status: "failed_retryable",
            processedAt: Timestamp.now(),
            error: errMsg,
            holdId,
            sessionId,
            paymentIntentId,
            amountTotal,
            currency,
          });
          return false;
        }
        try {
          await upsertPendingRefundRecord(
            db,
            {
              reason: "checkout_active_hold_convert_dead_letter",
              holdId,
              sessionId,
              paymentIntentId: paymentIntentId ?? null,
            },
            {
              holdId,
              sessionId,
              paymentIntentId,
              amountTotal,
              currency,
              convertError: errMsg.slice(0, 500),
              ...(hold.customerDraft?.email && { customerEmail: hold.customerDraft.email }),
            }
          );
        } catch (e) {
          console.error("[stripe-webhook] pendingRefunds checkout_active_hold_convert_dead_letter", e);
        }
        await writeOperationalAlert({
          type: "checkout_active_hold_convert_dead_letter",
          holdId,
          sessionId,
          paymentIntentId,
          source: "stripe-webhook",
          attempt,
          error: errMsg.slice(0, 300),
        });
        await writeEventResult(evId, {
          status: "failed_permanent",
          processedAt: Timestamp.now(),
          outcome: "checkout_active_hold_convert_dead_letter",
          error: errMsg,
          holdId,
          sessionId,
          paymentIntentId,
          amountTotal,
          currency,
        });
        return true;
      }
    };

    const runCheckoutSessionConversion = async (
      session: Stripe.Checkout.Session,
      evId: string,
      outcomePrefix: string
    ): Promise<boolean> => {
      const sessionId = session.id;
      const paymentIntentId =
        typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? undefined;
      const amountTotal = session.amount_total ?? undefined;
      const currency = session.currency ?? undefined;
      const holdId = session.metadata?.holdId;
      if (!holdId) {
        const attempt = await recordWebhookRetryAttempt(WH_RETRY_ASYNC_CHECKOUT_MISSING_HOLD_ID);
        if (webhookTransientFailureShouldRetry(attempt)) {
          await writeEventResult(evId, {
            status: "failed_retryable",
            processedAt: Timestamp.now(),
            error: "Missing holdId in session metadata",
            sessionId,
            paymentIntentId,
            amountTotal,
            currency,
          });
          return false;
        }
        await writeEventResult(evId, {
          status: "failed_permanent",
          processedAt: Timestamp.now(),
          outcome: "async_checkout_missing_hold_id_dead_letter",
          error: "Missing holdId in session metadata",
          sessionId,
          paymentIntentId,
          amountTotal,
          currency,
        });
        return true;
      }
      const holdRef = db.collection("holds").doc(holdId);
      const holdSnap = await holdRef.get();
      if (!holdSnap.exists) {
        const attempt = await recordWebhookRetryAttempt(WH_RETRY_ASYNC_CHECKOUT_HOLD_NOT_FOUND);
        if (webhookTransientFailureShouldRetry(attempt)) {
          await writeEventResult(evId, {
            status: "failed_retryable",
            processedAt: Timestamp.now(),
            error: "Hold not found",
            holdId,
            sessionId,
            paymentIntentId,
            amountTotal,
            currency,
          });
          return false;
        }
        try {
          await upsertPendingRefundRecord(
            db,
            {
              reason: "async_checkout_hold_not_found_dead_letter",
              holdId,
              sessionId,
              paymentIntentId: paymentIntentId ?? null,
            },
            { holdId, sessionId, paymentIntentId, amountTotal, currency }
          );
        } catch (e) {
          console.error("[stripe-webhook] pendingRefunds async_checkout_hold_not_found_dead_letter", e);
        }
        await writeOperationalAlert({
          type: "async_checkout_hold_not_found_dead_letter",
          holdId,
          sessionId,
          paymentIntentId,
          source: "stripe-webhook",
          attempt,
        });
        await writeEventResult(evId, {
          status: "failed_permanent",
          processedAt: Timestamp.now(),
          outcome: "async_checkout_hold_not_found_dead_letter",
          error: "Hold not found",
          holdId,
          sessionId,
          paymentIntentId,
          amountTotal,
          currency,
        });
        return true;
      }
      const hold = holdSnap.data() as Hold;
      if (hold.status !== "active") {
        if (hold.status === "converted") {
          const authCsConv = hold.checkoutSessionId?.trim();
          if (authCsConv && authCsConv !== sessionId) {
            const customerPatchedOk = await rejectStaleCheckoutIds(
              evId,
              holdId,
              hold,
              session,
              sessionId,
              paymentIntentId,
              amountTotal,
              currency,
              "async_checkout_stale_checkout_session_id"
            );
            if (!customerPatchedOk) {
              return false;
            }
            return true;
          }
          if (!paymentIntentId) {
            const attempt = await recordWebhookRetryAttempt(WH_RETRY_ASYNC_CONVERTED_HOLD_NO_PI);
            if (webhookTransientFailureShouldRetry(attempt)) {
              await writeEventResult(evId, {
                status: "failed_retryable",
                processedAt: Timestamp.now(),
                error: "Missing payment_intent for converted hold",
                holdId,
                sessionId,
                amountTotal,
                currency,
              });
              return false;
            }
            try {
              await upsertPendingRefundRecord(
                db,
                {
                  reason: "async_converted_hold_missing_pi_dead_letter",
                  holdId,
                  sessionId,
                  paymentIntentId: null,
                },
                { holdId, sessionId, amountTotal, currency }
              );
            } catch (e) {
              console.error("[stripe-webhook] pendingRefunds async_converted_hold_missing_pi_dead_letter", e);
            }
            await writeOperationalAlert({
              type: "async_converted_hold_missing_pi_dead_letter",
              holdId,
              sessionId,
              source: "stripe-webhook",
              attempt,
            });
            await writeEventResult(evId, {
              status: "failed_permanent",
              processedAt: Timestamp.now(),
              outcome: "async_converted_hold_missing_pi_dead_letter",
              error: "Missing payment_intent for converted hold",
              holdId,
              sessionId,
              amountTotal,
              currency,
            });
            return true;
          }
          const piConvGuard = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["payment_method"] });
          const holdPricingConv = {
            pricing: hold.pricing,
            tipCents: hold.tipCents,
            discountCents: hold.discountCents,
          };
          const convGuard = checkoutIncomingMismatchAgainstHold(
            sessionId,
            paymentIntentId,
            piConvGuard,
            {
              checkoutSessionId: hold.checkoutSessionId,
              depositPaymentIntentId: hold.depositPaymentIntentId,
              fullPaymentIntentId: hold.fullPaymentIntentId,
              paymentAttemptVersion: (hold as { paymentAttemptVersion?: number }).paymentAttemptVersion,
            },
            holdPricingConv
          );
          if (!convGuard.ok) {
            const customerPatchedOk = await rejectStaleCheckoutIds(
              evId,
              holdId,
              hold,
              session,
              sessionId,
              paymentIntentId,
              amountTotal,
              currency,
              convGuard.reason === "checkout_session_id_mismatch"
                ? "async_payment_succeeded_checkout_session_id_mismatch"
                : "async_payment_succeeded_payment_intent_mismatch_hold"
            );
            if (!customerPatchedOk) {
              return false;
            }
            return true;
          }
          const customerOverride = customerOverrideFromCheckoutSession(session, hold.customerDraft);
          let specialNotesOverride: string | undefined;
          if (Array.isArray(session.custom_fields)) {
            const field = session.custom_fields.find((f: { key?: string }) => f.key === "special_notes");
            const v = field && (field as { value?: string | { value?: string } }).value;
            specialNotesOverride =
              typeof v === "string"
                ? v.trim() || undefined
                : typeof v === "object" && v?.value != null
                  ? String(v.value).trim() || undefined
                  : undefined;
          }
          try {
            const conversion = await resolveAndConvertPayment(db, {
              paymentIntentId,
              holdId,
              source: "checkout_webhook",
              checkoutSession: session,
              checkoutSessionId: sessionId,
              paymentIntent: piConvGuard,
              amountTotalCents: amountTotal ?? undefined,
              currency: currency ?? undefined,
              ...(customerOverride ? { customerOverride } : {}),
              specialNotes: specialNotesOverride,
            });
            const result = conversion.result;
            if ("amountIntegrityMismatch" in result) {
              await writeOperationalAlert({
                type: "stripe_webhook_amount_integrity_mismatch",
                holdId,
                paymentIntentId,
                sessionId,
                source: `stripe-webhook_async_${outcomePrefix}_amount_integrity`,
              });
              try {
                await sendAmountIntegrityMismatchOpsEmail({
                  holdId,
                  paymentIntentId,
                  source: `stripe-webhook_async_${outcomePrefix}_amount_integrity`,
                });
              } catch (e) {
                console.error("[stripe-webhook] sendAmountIntegrityMismatchOpsEmail", e);
              }
              const em2 = (customerOverride?.email ?? hold.customerDraft.email)?.trim();
              if (em2) {
                try {
                  await sendAmountIntegrityMismatchCustomerEmail({
                    to: em2,
                    customerName:
                      customerOverride?.name?.trim() || hold.customerDraft.name?.trim() || "Guest",
                    holdId,
                  });
                } catch (e) {
                  console.error("[stripe-webhook] sendAmountIntegrityMismatchCustomerEmail", e);
                }
              }
              await writeEventResult(evId, {
                status: "completed",
                processedAt: Timestamp.now(),
                outcome: `${outcomePrefix}_amount_integrity_mismatch`,
                holdId,
                sessionId,
                paymentIntentId,
                amountTotal,
                currency,
              });
              return true;
            }
            let customerPatched = false;
            try {
              customerPatched = await patchBookingCustomerIfPlaceholderFromCheckoutSession(db, holdId, session, Timestamp.now());
            } catch (patchErr) {
              const lastError = patchErr instanceof Error ? patchErr.message : String(patchErr);
              await writeOperationalAlert({
                type: "stripe_webhook_customer_patch_failed",
                source: "stripe-webhook",
                holdId,
                sessionId,
                paymentIntentId,
                lastError: lastError.slice(0, 500),
              });
              customerPatched = false;
            }
            if ("alreadyConverted" in result) {
              await writeEventResult(evId, {
                status: "completed",
                processedAt: Timestamp.now(),
                outcome: `${outcomePrefix}_already_converted`,
                holdId,
                sessionId,
                paymentIntentId,
                amountTotal,
                currency,
                customerPatched,
              });
            } else {
              await writeEventResult(evId, {
                status: "completed",
                processedAt: Timestamp.now(),
                outcome: `${outcomePrefix}_booking_created`,
                bookingId: result.bookingId,
                holdId,
                sessionId,
                paymentIntentId,
                amountTotal,
                currency,
                customerPatched,
              });
            }
            deleteStripeCouponFromHoldIfSet(stripe, hold, holdId);
            if (!customerPatched) return false;
            return true;
          } catch (convertErr) {
            const errMsg = convertErr instanceof Error ? convertErr.message : String(convertErr);
            if (convertErr instanceof BlockCheckUnavailableError || convertErr instanceof LegacyScanLimitReachedError) {
              await writeEventResult(evId, {
                status: "failed_retryable",
                processedAt: Timestamp.now(),
                error: "BLOCK_CHECK_UNAVAILABLE",
                holdId,
                sessionId,
                paymentIntentId,
                amountTotal,
                currency,
              });
              return false;
            }
            if (isBookingBlockedByOperatorError(convertErr)) {
              try {
                const customerEmail = hold.customerDraft?.email;
                await upsertPendingRefundRecord(
                  db,
                  {
                    reason: "operator_date_blocked_at_conversion",
                    holdId,
                    paymentIntentId: paymentIntentId ?? null,
                  },
                  {
                    holdId,
                    paymentIntentId,
                    amountTotal,
                    currency,
                    ...(customerEmail && { customerEmail }),
                  }
                );
              } catch (refundFlagErr) {
                console.error("[stripe-webhook] pendingRefunds operator_date_blocked_at_conversion (async hold)", refundFlagErr);
              }
              await writeOperationalAlert({
                type: "stripe_webhook_operator_date_blocked_at_conversion",
                holdId,
                sessionId,
                paymentIntentId,
                source: "stripe-webhook",
                outcomePrefix,
              });
              await writeEventResult(evId, {
                status: "completed",
                processedAt: Timestamp.now(),
                outcome: `${outcomePrefix}_operator_date_blocked`,
                holdId,
                sessionId,
                paymentIntentId,
                amountTotal,
                currency,
              });
              return true;
            }
            if (errMsg === "Hold has expired") {
              try {
                const customerEmail = hold.customerDraft?.email;
                await upsertPendingRefundRecord(
                  db,
                  {
                    reason: "hold_expired_after_checkout_payment",
                    holdId,
                    sessionId,
                    paymentIntentId: paymentIntentId ?? null,
                  },
                  {
                    holdId,
                    sessionId,
                    paymentIntentId,
                    amountTotal,
                    currency,
                    ...(customerEmail && { customerEmail }),
                  }
                );
              } catch (refundFlagErr) {
                console.error("[stripe-webhook] pendingRefunds hold_expired_after_checkout_payment (async converted hold)", refundFlagErr);
              }
              await writeOperationalAlert({
                type: "hold_expired_after_checkout_payment",
                holdId,
                sessionId,
                paymentIntentId,
                source: "stripe-webhook",
                outcomePrefix,
              });
              await writeEventResult(evId, {
                status: "completed",
                processedAt: Timestamp.now(),
                outcome: "hold_expired_refund_flagged",
                error: errMsg,
                holdId,
                sessionId,
                paymentIntentId,
                amountTotal,
                currency,
              });
              return true;
            }
            bookingError("stripe-webhook", `${outcomePrefix} convertHoldToBooking failed (converted hold)`, convertErr, {
              holdId,
              sessionId,
              paymentIntentId,
              error: errMsg,
            });
            const attempt = await recordWebhookRetryAttempt(WH_RETRY_ASYNC_CHECKOUT_CONVERT_ERR);
            if (webhookTransientFailureShouldRetry(attempt)) {
              await writeEventResult(evId, {
                status: "failed_retryable",
                processedAt: Timestamp.now(),
                error: errMsg,
                holdId,
                sessionId,
                paymentIntentId,
                amountTotal,
                currency,
              });
              return false;
            }
            try {
              await upsertPendingRefundRecord(
                db,
                {
                  reason: "async_checkout_convert_dead_letter",
                  holdId,
                  sessionId,
                  paymentIntentId: paymentIntentId ?? null,
                },
                {
                  holdId,
                  sessionId,
                  paymentIntentId,
                  amountTotal,
                  currency,
                  convertError: errMsg.slice(0, 500),
                  ...(hold.customerDraft?.email && { customerEmail: hold.customerDraft.email }),
                }
              );
            } catch (e) {
              console.error("[stripe-webhook] pendingRefunds async_checkout_convert_dead_letter", e);
            }
            await writeOperationalAlert({
              type: "async_checkout_convert_dead_letter",
              holdId,
              sessionId,
              paymentIntentId,
              source: "stripe-webhook",
              attempt,
              error: errMsg.slice(0, 300),
            });
            await writeEventResult(evId, {
              status: "failed_permanent",
              processedAt: Timestamp.now(),
              outcome: "async_checkout_convert_dead_letter",
              error: errMsg,
              holdId,
              sessionId,
              paymentIntentId,
              amountTotal,
              currency,
            });
            return true;
          }
        }
        if (hold.status === "expired") {
          try {
            await upsertPendingRefundRecord(
              db,
              {
                reason: "async_checkout_completed_hold_expired_status",
                holdId,
                sessionId,
                paymentIntentId: paymentIntentId ?? null,
              },
              {
                holdId,
                sessionId,
                paymentIntentId: paymentIntentId ?? null,
                amountTotal,
                currency,
                ...(hold.customerDraft?.email && { customerEmail: hold.customerDraft.email }),
              }
            );
          } catch (refundErr) {
            console.error("[stripe-webhook] Failed to write pendingRefunds for async checkout expired hold", refundErr);
          }
          let customerPatched = false;
          try {
            customerPatched = await patchBookingCustomerIfPlaceholderFromCheckoutSession(db, holdId, session, Timestamp.now());
          } catch (patchErr) {
            const lastError = patchErr instanceof Error ? patchErr.message : String(patchErr);
            await writeOperationalAlert({
              type: "stripe_webhook_customer_patch_failed",
              source: "stripe-webhook",
              holdId,
              sessionId,
              paymentIntentId,
              lastError: lastError.slice(0, 500),
            });
            customerPatched = false;
          }
          await writeEventResult(evId, {
            status: "completed",
            processedAt: Timestamp.now(),
            outcome: `${outcomePrefix}_expired_hold_refund_required`,
            error: "Hold has expired",
            holdId,
            sessionId,
            paymentIntentId,
            amountTotal,
            currency,
            customerPatched,
          });
          if (!customerPatched) return false;
          return true;
        }
        await writeEventResult(evId, {
          status: "failed_permanent",
          processedAt: Timestamp.now(),
          error: `Unexpected hold status: ${hold.status}`,
          holdId,
          sessionId,
          paymentIntentId,
          amountTotal,
          currency,
        });
        await patchBookingCustomerIfPlaceholderFromCheckoutSession(db, holdId, session, Timestamp.now());
        return true;
      }
      return runCheckoutSessionActiveHoldConversion(session, evId, outcomePrefix);
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
      if (session.payment_status !== "paid") {
        bookingLog("stripe-webhook", "checkout.session.completed payment not yet paid; waiting for async_payment_succeeded", {
          sessionId,
          holdId,
          payment_status: session.payment_status,
        });
        await writeEventResult(eventId, {
          status: "completed",
          processedAt: Timestamp.now(),
          outcome: "deferred_async_payment",
          holdId,
          sessionId,
          paymentIntentId,
          amountTotal,
          currency,
        });
        return NextResponse.json({ received: true });
      }
      const holdRef = db.collection("holds").doc(holdId);
      const holdSnap = await holdRef.get();
      if (!holdSnap.exists) {
        console.error("[stripe-webhook] checkout.session.completed hold not found", { holdId, sessionId });
        const notFoundAttempt = await recordWebhookRetryAttempt(WH_RETRY_CHECKOUT_COMPLETED_HOLD_NOT_FOUND);
        if (webhookTransientFailureShouldRetry(notFoundAttempt)) {
          await writeEventResult(eventId, {
            status: "failed_retryable",
            processedAt: Timestamp.now(),
            error: "Hold not found",
            holdId,
            sessionId,
            paymentIntentId,
            amountTotal,
            currency,
          });
          return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
        }
        try {
          await upsertPendingRefundRecord(
            db,
            {
              reason: "checkout_completed_hold_permanently_missing",
              holdId,
              sessionId,
              paymentIntentId: paymentIntentId ?? null,
            },
            {
              holdId,
              sessionId,
              paymentIntentId,
              amountTotal,
              currency,
            }
          );
        } catch (refundErr) {
          console.error("[stripe-webhook] pendingRefunds checkout_completed_hold_permanently_missing", refundErr);
        }
        await writeOperationalAlert({
          type: "checkout_completed_hold_permanently_missing",
          holdId,
          sessionId,
          paymentIntentId,
          source: "stripe-webhook",
          attempt: notFoundAttempt,
        });
        await writeEventResult(eventId, {
          status: "failed_permanent",
          processedAt: Timestamp.now(),
          outcome: "checkout_completed_hold_permanently_missing",
          error: "Hold not found after retry threshold",
          holdId,
          sessionId,
          paymentIntentId,
          amountTotal,
          currency,
        });
        return NextResponse.json({ received: true });
      }
      const hold = holdSnap.data() as Hold;
      if (hold.status !== "active") {
        if (hold.status === "converted") {
          const authCs = hold.checkoutSessionId?.trim();
          if (authCs && authCs !== sessionId) {
            const customerPatchedOk = await rejectStaleCheckoutIds(
              eventId,
              holdId,
              hold,
              session,
              sessionId,
              paymentIntentId,
              amountTotal,
              currency,
              "checkout_session_completed_stale_checkout_session_id"
            );
            if (!customerPatchedOk) {
              return NextResponse.json(
                { error: "Customer email placeholder patch incomplete; Stripe will retry" },
                { status: 500 }
              );
            }
            return NextResponse.json({ received: true });
          }
          const recordedPiId = (hold as { fullPaymentIntentId?: string }).fullPaymentIntentId;
          if (!recordedPiId && paymentIntentId) {
            const bid = hold.bookingId;
            if (bid) {
              const bookingSnap = await db.collection("bookings").doc(bid).get();
              if (bookingSnap.exists) {
                const bookingRow = bookingSnap.data() as Booking;
                const mainPi = bookingRow.stripe?.paymentIntentId;
                const depPi = bookingRow.stripe?.depositPaymentIntentId;
                if (mainPi !== paymentIntentId && depPi !== paymentIntentId) {
                  const customerPatchedOk = await rejectStaleCheckoutIds(
                    eventId,
                    holdId,
                    hold,
                    session,
                    sessionId,
                    paymentIntentId,
                    amountTotal,
                    currency,
                    "checkout_session_completed_converted_hold_pi_mismatch_no_full_pi_on_hold"
                  );
                  if (!customerPatchedOk) {
                    return NextResponse.json(
                      { error: "Customer email placeholder patch incomplete; Stripe will retry" },
                      { status: 500 }
                    );
                  }
                  return NextResponse.json({ received: true });
                }
              } else {
              const customerPatchedOk = await rejectStaleCheckoutIds(
                eventId,
                holdId,
                hold,
                session,
                sessionId,
                paymentIntentId,
                amountTotal,
                currency,
                "checkout_session_completed_converted_hold_booking_missing"
              );
              if (!customerPatchedOk) {
                return NextResponse.json(
                  { error: "Customer email placeholder patch incomplete; Stripe will retry" },
                  { status: 500 }
                );
              }
              return NextResponse.json({ received: true });
              }
            }
          }
          if (recordedPiId && paymentIntentId && paymentIntentId !== recordedPiId) {
            try {
              await upsertPendingRefundRecord(
                db,
                {
                  reason: "duplicate_checkout_after_conversion",
                  holdId,
                  sessionId,
                  paymentIntentId: paymentIntentId ?? null,
                  expectedPaymentIntentId: recordedPiId,
                },
                {
                  holdId,
                  sessionId,
                  paymentIntentId,
                  expectedPaymentIntentId: recordedPiId,
                  amountTotal,
                  currency,
                  ...(hold.customerDraft?.email && { customerEmail: hold.customerDraft.email }),
                }
              );
              bookingWarn("stripe-webhook", "checkout.session.completed duplicate payment intent; flagged for refund", {
                holdId,
                paymentIntentId,
                expectedPaymentIntentId: recordedPiId,
              });
            } catch (refundErr) {
              console.error("[stripe-webhook] Failed to write pendingRefunds for duplicate checkout", refundErr);
            }
            let customerPatched = false;
            try {
              customerPatched = await patchBookingCustomerIfPlaceholderFromCheckoutSession(db, holdId, session, Timestamp.now());
            } catch (patchErr) {
              const lastError = patchErr instanceof Error ? patchErr.message : String(patchErr);
              await writeOperationalAlert({
                type: "stripe_webhook_customer_patch_failed",
                source: "stripe-webhook",
                holdId,
                sessionId,
                paymentIntentId,
                lastError: lastError.slice(0, 500),
              });
              customerPatched = false;
            }
            await writeEventResult(eventId, {
              status: "completed",
              processedAt: Timestamp.now(),
              outcome: "duplicate_checkout_flagged_refund",
              holdId,
              sessionId,
              paymentIntentId,
              amountTotal,
              currency,
              customerPatched,
            });
            deleteStripeCouponFromHoldIfSet(stripe, hold, holdId);
            if (!customerPatched) {
              return NextResponse.json(
                { error: "Customer email placeholder patch incomplete; Stripe will retry" },
                { status: 500 }
              );
            }
            return NextResponse.json({ received: true });
          }
          bookingLog("stripe-webhook", "checkout.session.completed hold already converted (idempotent)", { holdId });
          let customerPatched = false;
          try {
            customerPatched = await patchBookingCustomerIfPlaceholderFromCheckoutSession(db, holdId, session, Timestamp.now());
          } catch (patchErr) {
            const lastError = patchErr instanceof Error ? patchErr.message : String(patchErr);
            await writeOperationalAlert({
              type: "stripe_webhook_customer_patch_failed",
              source: "stripe-webhook",
              holdId,
              sessionId,
              paymentIntentId,
              lastError: lastError.slice(0, 500),
            });
            customerPatched = false;
          }
          await writeEventResult(eventId, {
            status: "completed",
            processedAt: Timestamp.now(),
            outcome: "checkout_session_completed_hold_converted_idempotent",
            holdId,
            sessionId,
            paymentIntentId,
            amountTotal,
            currency,
            customerPatched,
          });
          deleteStripeCouponFromHoldIfSet(stripe, hold, holdId);
          if (!customerPatched) {
            return NextResponse.json(
              { error: "Customer email placeholder patch incomplete; Stripe will retry" },
              { status: 500 }
            );
          }
          return NextResponse.json({ received: true });
        }
        if (hold.status === "expired") {
          bookingWarn("stripe-webhook", "checkout.session.completed hold expired — refund required", {
            holdId,
            sessionId,
          });
          try {
            await upsertPendingRefundRecord(
              db,
              {
                reason: "checkout_completed_hold_expired_status",
                holdId,
                sessionId,
                paymentIntentId: paymentIntentId ?? null,
              },
              {
                holdId,
                sessionId,
                paymentIntentId: paymentIntentId ?? null,
                amountTotal,
                currency,
                ...(hold.customerDraft?.email && { customerEmail: hold.customerDraft.email }),
              }
            );
          } catch (refundFlagErr) {
            console.error("[stripe-webhook] Failed to write pendingRefunds for expired hold checkout", refundFlagErr);
          }
          let customerPatched = false;
          try {
            customerPatched = await patchBookingCustomerIfPlaceholderFromCheckoutSession(db, holdId, session, Timestamp.now());
          } catch (patchErr) {
            const lastError = patchErr instanceof Error ? patchErr.message : String(patchErr);
            await writeOperationalAlert({
              type: "stripe_webhook_customer_patch_failed",
              source: "stripe-webhook",
              holdId,
              sessionId,
              paymentIntentId,
              lastError: lastError.slice(0, 500),
            });
            customerPatched = false;
          }
          await writeEventResult(eventId, {
            status: "completed",
            processedAt: Timestamp.now(),
            outcome: "checkout_session_completed_expired_hold_refund_required",
            error: "Hold has expired",
            holdId,
            sessionId,
            paymentIntentId,
            amountTotal,
            currency,
            customerPatched,
          });
          if (!customerPatched) {
            return NextResponse.json(
              { error: "Customer email placeholder patch incomplete; Stripe will retry" },
              { status: 500 }
            );
          }
          return NextResponse.json({ received: true });
        }
        console.error("[stripe-webhook] checkout.session.completed unexpected hold status", { holdId, status: hold.status });
        await writeEventResult(eventId, {
          status: "failed_permanent",
          processedAt: Timestamp.now(),
          error: `Unexpected hold status: ${hold.status}`,
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
        bookingLog("stripe-webhook", "checkout.session.completed hold expired (idempotent success)", { holdId, sessionId });
        try {
          await upsertPendingRefundRecord(
            db,
            {
              reason: "hold_expired_after_checkout_payment",
              holdId,
              sessionId,
              paymentIntentId: paymentIntentId ?? null,
            },
            {
              holdId,
              sessionId,
              paymentIntentId,
              amountTotal,
              currency,
              ...(hold.customerDraft?.email && { customerEmail: hold.customerDraft.email }),
            }
          );
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
        const attempt = await recordWebhookRetryAttempt(WH_RETRY_CHECKOUT_COMPLETED_NO_PI);
        if (webhookTransientFailureShouldRetry(attempt)) {
          await writeEventResult(eventId, {
            status: "failed_retryable",
            processedAt: Timestamp.now(),
            error: "Missing payment_intent",
            holdId,
            sessionId,
            amountTotal,
            currency,
          });
          return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
        }
        try {
          await upsertPendingRefundRecord(
            db,
            {
              reason: "checkout_completed_missing_pi_dead_letter",
              holdId,
              sessionId,
              paymentIntentId: null,
            },
            { holdId, sessionId, amountTotal, currency }
          );
        } catch (e) {
          console.error("[stripe-webhook] pendingRefunds checkout_completed_missing_pi_dead_letter", e);
        }
        await writeOperationalAlert({
          type: "checkout_completed_missing_pi_dead_letter",
          holdId,
          sessionId,
          source: "stripe-webhook",
          attempt,
        });
        await writeEventResult(eventId, {
          status: "failed_permanent",
          processedAt: Timestamp.now(),
          outcome: "checkout_completed_missing_pi_dead_letter",
          error: "Missing payment_intent",
          holdId,
          sessionId,
          amountTotal,
          currency,
        });
        return NextResponse.json({ received: true });
      }
      const okCompleted = await runCheckoutSessionActiveHoldConversion(session, eventId, "checkout_session_completed");
      if (!okCompleted) return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
      return NextResponse.json({ received: true });
    }

    if (event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== "paid") {
        bookingLog("stripe-webhook", "checkout.session.async_payment_succeeded payment_status not paid", { sessionId: session.id, payment_status: session.payment_status });
        const attempt = await recordWebhookRetryAttempt(WH_RETRY_ASYNC_PAYMENT_NOT_PAID);
        if (webhookTransientFailureShouldRetry(attempt)) {
          await writeEventResult(eventId, {
            status: "failed_retryable",
            processedAt: Timestamp.now(),
            error: "payment_status not paid",
            sessionId: session.id,
          });
          return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
        }
        const piAsync = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
        await writeOperationalAlert({
          type: "async_payment_succeeded_status_not_paid_dead_letter",
          sessionId: session.id,
          paymentIntentId: piAsync,
          source: "stripe-webhook",
          attempt,
          payment_status: session.payment_status,
        });
        await writeEventResult(eventId, {
          status: "failed_permanent",
          processedAt: Timestamp.now(),
          outcome: "async_payment_succeeded_status_not_paid_dead_letter",
          error: "payment_status not paid after retry threshold",
          sessionId: session.id,
          paymentIntentId: typeof piAsync === "string" ? piAsync : undefined,
        });
        return NextResponse.json({ received: true });
      }
      const ok = await runCheckoutSessionConversion(session, eventId, "async_payment_succeeded");
      if (!ok) return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
      return NextResponse.json({ received: true });
    }

    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const sessionId = session.id;
      const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? undefined;
      const holdId = session.metadata?.holdId;
      const amountTotal = session.amount_total ?? undefined;
      const currency = session.currency ?? undefined;
      bookingLog("stripe-webhook", "checkout.session.async_payment_failed", { sessionId, holdId, paymentIntentId: paymentIntentId ?? null });
      let amountReceived: number | null = null;
      let partialRefundQueued = false;
      if (paymentIntentId) {
        try {
          const stripe = getStripe();
          const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
          const ar = typeof pi.amount_received === "number" ? pi.amount_received : 0;
          amountReceived = ar;
          if (ar > 0) {
            await upsertPendingRefundRecord(
              db,
              {
                reason: "async_payment_failed_partial_capture",
                ...(holdId ? { holdId } : {}),
                paymentIntentId,
              },
              {
                ...(holdId ? { holdId } : {}),
                paymentIntentId,
                amountTotal: typeof pi.amount === "number" ? pi.amount : undefined,
                currency: typeof pi.currency === "string" ? pi.currency : undefined,
              }
            );
            partialRefundQueued = true;
            bookingLog("stripe-webhook", "async_payment_failed partial capture — pendingRefund queued", {
              sessionId,
              paymentIntentId,
              amountReceived: ar,
            });
          } else {
            bookingLog("stripe-webhook", "async_payment_failed zero amount_received — hold release only", {
              sessionId,
              paymentIntentId,
            });
          }
        } catch (piErr) {
          bookingWarn("stripe-webhook", "async_payment_failed payment_intent retrieve failed", {
            sessionId,
            paymentIntentId,
            err: piErr instanceof Error ? piErr.message : String(piErr),
          });
        }
      }
      if (holdId) {
        try {
          const holdRef = db.collection("holds").doc(holdId);
          await runExpiredHoldReleaseTransaction(db, FieldValue, holdRef);
        } catch (releaseErr) {
          console.error("[stripe-webhook] async_payment_failed hold release failed", releaseErr);
        }
      }
      await writeEventResult(eventId, {
        status: "completed",
        processedAt: Timestamp.now(),
        outcome: "async_payment_failed_hold_released",
        holdId: holdId ?? undefined,
        sessionId,
        paymentIntentId,
        amountTotal,
        currency,
        amountReceived,
        partialRefundQueued,
      });
      return NextResponse.json({ received: true });
    }

    if (event.type === "payment_intent.succeeded") {
      const piRaw = event.data.object as Stripe.PaymentIntent;
      const piId = piRaw.id;
      const piAmountTotal = piRaw.amount ?? undefined;
      const piCurrency = piRaw.currency ?? undefined;
      const paymentStage = piRaw.metadata?.payment_stage;
      const holdIdFromMeta = piRaw.metadata?.holdId;
      bookingLog("stripe-webhook", "payment_intent.succeeded", {
        eventId,
        paymentStage: paymentStage ?? null,
        paymentIntentId: piId,
        holdId: holdIdFromMeta ?? null,
      });

      if (paymentStage === "final") {
        const bookingId = piRaw.metadata?.bookingId;
        if (!bookingId) {
          console.error("[stripe-webhook] payment_intent.succeeded final missing bookingId");
          const attempt = await recordWebhookRetryAttempt(WH_RETRY_FINAL_PI_MISSING_BOOKING_ID);
          if (webhookTransientFailureShouldRetry(attempt)) {
            await writeEventResult(eventId, {
              status: "failed_retryable",
              processedAt: Timestamp.now(),
              error: "Missing bookingId for final",
              paymentIntentId: piId,
              amountTotal: piAmountTotal,
              currency: piCurrency,
            });
            return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
          }
          try {
            await upsertPendingRefundRecord(
              db,
              { reason: "final_pi_succeeded_missing_booking_id_dead_letter", paymentIntentId: piId },
              {
                paymentIntentId: piId,
                amountTotal: piAmountTotal,
                currency: piCurrency,
              }
            );
          } catch (e) {
            console.error("[stripe-webhook] pendingRefunds final_pi_succeeded_missing_booking_id_dead_letter", e);
          }
          await writeOperationalAlert({
            type: "final_pi_succeeded_missing_booking_id_dead_letter",
            paymentIntentId: piId,
            source: "stripe-webhook",
            attempt,
          });
          await writeEventResult(eventId, {
            status: "failed_permanent",
            processedAt: Timestamp.now(),
            outcome: "final_pi_succeeded_missing_booking_id_dead_letter",
            error: "Missing bookingId for final",
            paymentIntentId: piId,
            amountTotal: piAmountTotal,
            currency: piCurrency,
          });
          return NextResponse.json({ received: true });
        }
        const bookingRef = db.collection("bookings").doc(bookingId);
        const bookingSnap = await bookingRef.get();
        if (!bookingSnap.exists) {
          console.error("[stripe-webhook] payment_intent.succeeded final booking not found", { bookingId });
          const attempt = await recordWebhookRetryAttempt(WH_RETRY_FINAL_BOOKING_DOC_NOT_FOUND);
          if (webhookTransientFailureShouldRetry(attempt)) {
            await writeEventResult(eventId, {
              status: "failed_retryable",
              processedAt: Timestamp.now(),
              error: "Booking not found",
              bookingId,
              paymentIntentId: piId,
              amountTotal: piAmountTotal,
              currency: piCurrency,
            });
            return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
          }
          try {
            await upsertPendingRefundRecord(
              db,
              { reason: "final_pi_succeeded_booking_not_found_dead_letter", bookingId, paymentIntentId: piId },
              {
                bookingId,
                paymentIntentId: piId,
                amountTotal: piAmountTotal,
                currency: piCurrency,
              }
            );
          } catch (e) {
            console.error("[stripe-webhook] pendingRefunds final_pi_succeeded_booking_not_found_dead_letter", e);
          }
          await writeOperationalAlert({
            type: "final_pi_succeeded_booking_not_found_dead_letter",
            bookingId,
            paymentIntentId: piId,
            source: "stripe-webhook",
            attempt,
          });
          await writeEventResult(eventId, {
            status: "failed_permanent",
            processedAt: Timestamp.now(),
            outcome: "final_pi_succeeded_booking_not_found_dead_letter",
            error: "Booking not found",
            bookingId,
            paymentIntentId: piId,
            amountTotal: piAmountTotal,
            currency: piCurrency,
          });
          return NextResponse.json({ received: true });
        }

        type FinalPiTxResult =
          | { action: "write_final_paid" }
          | { action: "pending_refund"; reason: string; authPi?: string; customerEmail?: string }
          | { action: "event_only"; outcome: string };

        const txResult: FinalPiTxResult = await db.runTransaction(async (tx): Promise<FinalPiTxResult> => {
          const snap = await tx.get(bookingRef);
          if (!snap.exists) {
            return { action: "event_only", outcome: "final_tx_booking_missing" };
          }
          const bookingData = snap.data() as Booking;
          const st = bookingData.status;
          const authPi = bookingData.stripe?.finalPaymentIntentId?.trim();
          const customerEmail = bookingData.customer?.email?.trim();

          if (st === "canceled" || st === "refunded") {
            return {
              action: "pending_refund",
              reason: "final_payment_succeeded_after_booking_canceled_or_refunded",
              customerEmail: customerEmail || undefined,
            };
          }

          if (st === "final_paid" && authPi && authPi !== piId) {
            return { action: "pending_refund", reason: "duplicate_final_charge", authPi };
          }
          if (st === "final_paid" && authPi === piId) {
            return { action: "event_only", outcome: "final_paid_idempotent" };
          }

          if (authPi && authPi !== piId) {
            return { action: "pending_refund", reason: "final_webhook_non_authoritative_pi", authPi };
          }

          if (!FINAL_PAYMENT_ACTIVE_STATUSES.has(st)) {
            bookingLog("stripe-webhook", "payment_intent.succeeded final ignored (unexpected booking status)", { bookingId, status: st });
            return { action: "event_only", outcome: "final_succeeded_unexpected_status_no_mutation" };
          }

          const finalRev = typeof bookingData.stripe?.finalAmountCents === "number" ? bookingData.stripe.finalAmountCents : 0;
          const authoritativeFinalCents =
            finalRev > 0 ? finalRev : resolveFinalBalanceFromBooking(bookingData).authoritativeFinalCents;
          // Final payment revenue month bucket uses booking.summaryMonthKey (or createdAt) inside transitionToFinalPaid, not webhook time.
          await transitionToFinalPaid(
            tx,
            db,
            bookingRef,
            bookingData,
            bookingId,
            piId,
            FieldValue,
            Timestamp,
            authoritativeFinalCents
          );
          return { action: "write_final_paid" };
        });

        switch (txResult.action) {
          case "pending_refund": {
            const pr = txResult;
            try {
              if (pr.reason === "final_payment_succeeded_after_booking_canceled_or_refunded") {
                await db.runTransaction(async (tx) => {
                  const bs = await tx.get(bookingRef);
                  if (!bs.exists) return;
                  const b = bs.data() as Booking;
                  if (b.status !== "canceled" && b.status !== "refunded") return;
                  const expResolved = await resolveExperienceDocAndSlug(db, b.experienceId);
                  const bookingForReset = expResolved ? ({ ...b, experienceId: expResolved.docId } as Booking) : b;
                  await resetBookingSlotsToOpenInTransaction(
                    db,
                    tx,
                    bookingId,
                    bookingForReset,
                    expResolved?.slug ?? ""
                  );
                });
                bookingLog("stripe-webhook", "payment_intent.succeeded final: terminal booking at tx time — pending refund", { bookingId });
                await upsertPendingRefundRecord(
                  db,
                  { reason: pr.reason, bookingId, paymentIntentId: piId },
                  {
                    bookingId,
                    paymentIntentId: piId,
                    amountTotal: piAmountTotal,
                    currency: piCurrency,
                    ...(pr.customerEmail && { customerEmail: pr.customerEmail }),
                  }
                );
              } else if (pr.reason === "duplicate_final_charge" && pr.authPi) {
                await upsertPendingRefundRecord(
                  db,
                  {
                    reason: "duplicate_final_charge",
                    bookingId,
                    duplicatePaymentIntentId: piId,
                    expectedPaymentIntentId: pr.authPi,
                  },
                  {
                    bookingId,
                    duplicatePaymentIntentId: piId,
                    expectedPaymentIntentId: pr.authPi,
                  }
                );
                console.warn("[stripe-webhook] Duplicate final charge flagged for refund", { bookingId, duplicatePaymentIntentId: piId, expectedPaymentIntentId: pr.authPi });
              } else if (pr.reason === "final_webhook_non_authoritative_pi" && pr.authPi) {
                await upsertPendingRefundRecord(
                  db,
                  {
                    reason: "final_webhook_non_authoritative_pi",
                    bookingId,
                    paymentIntentId: piId,
                    expectedPaymentIntentId: pr.authPi,
                  },
                  {
                    bookingId,
                    paymentIntentId: piId,
                    expectedPaymentIntentId: pr.authPi,
                    amountTotal: piAmountTotal,
                    currency: piCurrency,
                  }
                );
                await writeOperationalAlert({
                  type: "final_webhook_non_authoritative_pi",
                  bookingId,
                  paymentIntentId: piId,
                  expectedPaymentIntentId: pr.authPi,
                  source: "stripe-webhook",
                });
              }
            } catch (refundFlagErr) {
              console.error("[stripe-webhook] Failed to write pendingRefunds (final payment path)", refundFlagErr);
            }
            const outcomeByReason: Record<string, string> = {
              final_payment_succeeded_after_booking_canceled_or_refunded: "final_succeeded_terminal_booking_refund_pending",
              duplicate_final_charge: "duplicate_final_flagged",
              final_webhook_non_authoritative_pi: "final_succeeded_stale_intent_no_mutation",
            };
            await writeEventResult(eventId, {
              status: "completed",
              processedAt: Timestamp.now(),
              outcome: outcomeByReason[pr.reason] ?? "final_pending_refund",
              bookingId,
              paymentIntentId: piId,
              amountTotal: piAmountTotal,
              currency: piCurrency,
            });
            return NextResponse.json({ received: true });
          }
          case "write_final_paid":
            console.log("[stripe-webhook] payment_intent.succeeded final_paid", { eventId, bookingId, paymentIntentId: piId });
            await writeEventResult(eventId, { status: "completed", processedAt: Timestamp.now(), outcome: "final_paid", bookingId, paymentIntentId: piId, amountTotal: piAmountTotal, currency: piCurrency });
            return NextResponse.json({ received: true });
          case "event_only": {
            const ev = txResult;
            await writeEventResult(eventId, {
              status: "completed",
              processedAt: Timestamp.now(),
              outcome: ev.outcome,
              bookingId,
              paymentIntentId: piId,
              amountTotal: piAmountTotal,
              currency: piCurrency,
            });
            return NextResponse.json({ received: true });
          }
        }
      }

      const holdId = piRaw.metadata?.holdId;
      if (!holdId && !paymentStage) {
        await writeEventResult(eventId, { status: "completed", processedAt: Timestamp.now(), outcome: "skipped_no_booking_metadata", paymentIntentId: piId, amountTotal: piAmountTotal, currency: piCurrency });
        return NextResponse.json({ received: true });
      }
      if (!holdId) {
        const piMissingAttempt = await recordWebhookRetryAttempt(WH_RETRY_PI_SUCCEEDED_HOLD_MISSING);
        try {
          await upsertPendingRefundRecord(
            db,
            {
              reason: "pi_succeeded_hold_id_missing_in_metadata",
              paymentIntentId: piId,
            },
            {
              paymentIntentId: piId,
              amountTotal: piAmountTotal,
              currency: piCurrency,
              paymentStage: paymentStage ?? null,
            }
          );
        } catch (e) {
          console.error("[stripe-webhook] pendingRefunds pi_succeeded_hold_id_missing_in_metadata", e);
        }
        if (
          webhookTransientFailureShouldRetry(
            piMissingAttempt,
            STRIPE_WEBHOOK_PI_HOLD_MISSING_RETRY_THRESHOLD
          )
        ) {
          await writeEventResult(eventId, {
            status: "failed_retryable",
            processedAt: Timestamp.now(),
            error: "Missing holdId in metadata (awaiting metadata)",
            paymentIntentId: piId,
            amountTotal: piAmountTotal,
            currency: piCurrency,
          });
          return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
        }
        await writeOperationalAlert({
          type: "pi_succeeded_hold_id_missing_in_metadata",
          paymentIntentId: piId,
          paymentStage,
          source: "stripe-webhook",
          attempt: piMissingAttempt,
        });
        bookingError("stripe-webhook", "payment_intent.succeeded missing holdId in metadata after retry threshold", null, {
          paymentIntentId: piId,
        });
        await writeEventResult(eventId, {
          status: "failed_permanent",
          processedAt: Timestamp.now(),
          outcome: "pi_succeeded_hold_id_missing_dead_letter",
          error: "Missing holdId in metadata",
          paymentIntentId: piId,
          amountTotal: piAmountTotal,
          currency: piCurrency,
        });
        return NextResponse.json({ received: true });
      }
      bookingLog("stripe-webhook", "payment_intent.succeeded resolving PI and calling convertHoldToBooking", { holdId, paymentIntentId: piId });

      const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["payment_method"] });
      const holdSnapForConvert = await db.collection("holds").doc(holdId).get();
      const holdRow = holdSnapForConvert.exists ? (holdSnapForConvert.data() as Hold) : null;

      if (holdRow?.status === "converted" && holdRow.bookingId) {
        const bEarlySnap = await db.collection("bookings").doc(holdRow.bookingId).get();
        if (bEarlySnap.exists) {
          const bEarly = bEarlySnap.data() as Booking;
          const bookingFinalPi = bEarly.stripe?.finalPaymentIntentId?.trim();
          if (bookingFinalPi && bookingFinalPi === piId) {
            await writeEventResult(eventId, {
              status: "completed",
              processedAt: Timestamp.now(),
              outcome: "final_pi_succeeded_idempotent_after_conversion",
              holdId,
              bookingId: holdRow.bookingId,
              paymentIntentId: piId,
              amountTotal: piAmountTotal,
              currency: piCurrency,
            });
            return NextResponse.json({ received: true });
          }
          const metaSt = piRaw.metadata?.payment_stage;
          if ((metaSt === "deposit" || metaSt === "full") && piId !== bookingFinalPi) {
            try {
              await upsertPendingRefundRecord(
                db,
                {
                  reason: "post_conversion_preconversion_success",
                  holdId,
                  bookingId: holdRow.bookingId,
                  paymentIntentId: piId,
                  duplicatePaymentIntentId: piId,
                  expectedPaymentIntentId: bookingFinalPi ?? null,
                },
                {
                  holdId,
                  bookingId: holdRow.bookingId,
                  duplicatePaymentIntentId: piId,
                  expectedPaymentIntentId: bookingFinalPi ?? null,
                  amountTotal: piAmountTotal,
                  currency: piCurrency,
                  ...(holdRow.customerDraft?.email && { customerEmail: holdRow.customerDraft.email }),
                }
              );
            } catch (e) {
              console.error("[stripe-webhook] pendingRefunds post_conversion_preconversion", e);
            }
            await writeOperationalAlert({
              type: "post_conversion_preconversion_success",
              holdId,
              bookingId: holdRow.bookingId,
              paymentIntentId: piId,
              source: "stripe-webhook",
            });
            await writeEventResult(eventId, {
              status: "completed",
              processedAt: Timestamp.now(),
              outcome: "post_conversion_preconversion_duplicate_flagged",
              holdId,
              bookingId: holdRow.bookingId,
              paymentIntentId: piId,
              amountTotal: piAmountTotal,
              currency: piCurrency,
            });
            return NextResponse.json({ received: true });
          }
        }
      }

      const holdDraft = holdRow?.customerDraft ?? { name: "", email: "", phone: "" };
      const customerOverridePi = customerOverrideFromPaymentIntent(pi, holdDraft);
      const holdForPricing = holdRow
        ? {
            pricing: holdRow.pricing,
            tipCents: (holdRow as { tipCents?: number }).tipCents,
            discountCents: (holdRow as { discountCents?: number }).discountCents,
          }
        : null;

      if (holdRow) {
        const holdIntentIds = {
          depositPaymentIntentId: (holdRow as { depositPaymentIntentId?: string }).depositPaymentIntentId,
          fullPaymentIntentId: (holdRow as { fullPaymentIntentId?: string }).fullPaymentIntentId,
          paymentAttemptVersion: (holdRow as { paymentAttemptVersion?: number }).paymentAttemptVersion,
        };
        const intentMatch = paymentIntentMatchesHoldForConversion(pi, holdIntentIds, holdForPricing, {
          holdDocId: holdId,
        });
        if (!intentMatch.ok) {
          try {
            await upsertPendingRefundRecord(
              db,
              {
                reason: "payment_intent_stale_or_mismatched_hold_webhook",
                holdId,
                paymentIntentId: piId,
              },
              {
                holdId,
                paymentIntentId: piId,
                holdDepositPaymentIntentId: holdIntentIds.depositPaymentIntentId ?? null,
                holdFullPaymentIntentId: holdIntentIds.fullPaymentIntentId ?? null,
                amountTotal: piAmountTotal,
                currency: piCurrency,
                ...(holdRow.customerDraft?.email && { customerEmail: holdRow.customerDraft.email }),
              }
            );
          } catch (refundErr) {
            console.error("[stripe-webhook] Failed to write pendingRefunds for stale/mismatched PI", refundErr);
          }
          bookingWarn("stripe-webhook", "payment_intent.succeeded PI does not match hold intent ids; refund required", {
            holdId,
            paymentIntentId: piId,
            holdDepositPaymentIntentId: holdIntentIds.depositPaymentIntentId ?? null,
            holdFullPaymentIntentId: holdIntentIds.fullPaymentIntentId ?? null,
          });
          await writeEventResult(eventId, {
            status: "completed",
            processedAt: Timestamp.now(),
            outcome: "payment_intent_succeeded_stale_intent_refund_required",
            holdId,
            paymentIntentId: piId,
            amountTotal: piAmountTotal,
            currency: piCurrency,
          });
          return NextResponse.json({ received: true });
        }
      }

      if (holdRow?.status === "converted" && holdRow.bookingId) {
        bookingLog("stripe-webhook", "payment_intent.succeeded hold already converted before resolveAndConvertPayment", {
          holdId,
          bookingId: holdRow.bookingId,
          paymentIntentId: piId,
        });
        await writeEventResult(eventId, {
          status: "completed",
          processedAt: Timestamp.now(),
          outcome: "already_converted",
          holdId,
          bookingId: holdRow.bookingId,
          paymentIntentId: piId,
          amountTotal: piAmountTotal,
          currency: piCurrency,
        });
        return NextResponse.json({ received: true });
      }

      try {
        const conversion = await resolveAndConvertPayment(db, {
          paymentIntentId: piId,
          holdId,
          source: "pi_webhook",
          paymentIntent: pi,
          customerOverride: customerOverridePi,
        });
        const result = conversion.result;
        if ("amountIntegrityMismatch" in result) {
          bookingWarn("stripe-webhook", "convertHoldToBooking amount integrity mismatch", { holdId, paymentIntentId: piId });
          await writeOperationalAlert({
            type: "stripe_webhook_amount_integrity_mismatch",
            holdId,
            paymentIntentId: piId,
            source: "stripe-webhook_payment_intent_succeeded",
          });
          try {
            await sendAmountIntegrityMismatchOpsEmail({
              holdId,
              paymentIntentId: piId,
              source: "stripe-webhook_payment_intent_succeeded",
            });
          } catch (e) {
            console.error("[stripe-webhook] sendAmountIntegrityMismatchOpsEmail", e);
          }
          const draft = holdRow?.customerDraft;
          const emPi = draft?.email?.trim();
          if (emPi) {
            try {
              await sendAmountIntegrityMismatchCustomerEmail({
                to: emPi,
                customerName: draft?.name?.trim() || "Guest",
                holdId,
              });
            } catch (e) {
              console.error("[stripe-webhook] sendAmountIntegrityMismatchCustomerEmail", e);
            }
          }
          await writeEventResult(eventId, {
            status: "completed",
            processedAt: Timestamp.now(),
            outcome: "amount_integrity_mismatch",
            holdId,
            paymentIntentId: piId,
            amountTotal: piAmountTotal,
            currency: piCurrency,
          });
          return NextResponse.json({ received: true });
        }
        if ("alreadyConverted" in result) {
          bookingLog("stripe-webhook", "payment_intent.succeeded hold already converted", { holdId, paymentIntentId: piId });
          await writeEventResult(eventId, { status: "completed", processedAt: Timestamp.now(), outcome: "already_converted", holdId, paymentIntentId: piId, amountTotal: piAmountTotal, currency: piCurrency });
        } else {
          bookingLog("stripe-webhook", "payment_intent.succeeded booking created", { bookingId: result.bookingId, holdId });
          await writeEventResult(eventId, { status: "completed", processedAt: Timestamp.now(), outcome: "booking_created", bookingId: result.bookingId, holdId, paymentIntentId: piId, amountTotal: piAmountTotal, currency: piCurrency });
        }
        return NextResponse.json({ received: true });
      } catch (convertErr) {
        const errMsg = convertErr instanceof Error ? convertErr.message : String(convertErr);
        if (convertErr instanceof ResolveAndConvertPaymentError && convertErr.kind === "PI_MATCH_FAILED") {
          await writeEventResult(eventId, {
            status: "failed_retryable",
            processedAt: Timestamp.now(),
            error: "PI_MATCH_FAILED",
            holdId,
            paymentIntentId: piId,
            amountTotal: piAmountTotal,
            currency: piCurrency,
          });
          return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
        }
        if (convertErr instanceof BlockCheckUnavailableError || convertErr instanceof LegacyScanLimitReachedError) {
          await writeEventResult(eventId, {
            status: "failed_retryable",
            processedAt: Timestamp.now(),
            error: "BLOCK_CHECK_UNAVAILABLE",
            holdId,
            paymentIntentId: piId,
            amountTotal: piAmountTotal,
            currency: piCurrency,
          });
          return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
        }
        if (isBookingBlockedByOperatorError(convertErr)) {
          try {
            const holdSnapForRefund = await db.collection("holds").doc(holdId).get();
            const holdDataForRefund = holdSnapForRefund.exists
              ? (holdSnapForRefund.data() as { customerDraft?: { email?: string } })
              : null;
            const customerEmail = holdDataForRefund?.customerDraft?.email;
            await upsertPendingRefundRecord(
              db,
              {
                reason: "operator_date_blocked_at_conversion",
                holdId,
                paymentIntentId: piId,
              },
              {
                holdId,
                paymentIntentId: piId,
                amountTotal: piAmountTotal,
                currency: piCurrency,
                ...(customerEmail && { customerEmail }),
              }
            );
          } catch (refundFlagErr) {
            console.error("[stripe-webhook] pendingRefunds operator_date_blocked_at_conversion (pi succeeded)", refundFlagErr);
          }
          await writeOperationalAlert({
            type: "stripe_webhook_operator_date_blocked_at_conversion",
            holdId,
            paymentIntentId: piId,
            amount: piAmountTotal,
            currency: piCurrency,
            source: "stripe-webhook",
          });
          await writeEventResult(eventId, {
            status: "completed",
            processedAt: Timestamp.now(),
            outcome: "operator_date_blocked_at_conversion",
            holdId,
            paymentIntentId: piId,
            amountTotal: piAmountTotal,
            currency: piCurrency,
          });
          return NextResponse.json({ received: true });
        }
        if (errMsg === "Hold has expired") {
          try {
            const holdSnapForRefund = await db.collection("holds").doc(holdId).get();
            const holdDataForRefund = holdSnapForRefund.exists ? (holdSnapForRefund.data() as { customerDraft?: { email?: string } }) : null;
            const customerEmail = holdDataForRefund?.customerDraft?.email;
            await upsertPendingRefundRecord(
              db,
              {
                reason: "hold_expired_after_payment",
                holdId,
                duplicatePaymentIntentId: piId,
              },
              {
                holdId,
                duplicatePaymentIntentId: piId,
                ...(customerEmail && { customerEmail }),
              }
            );
          } catch (refundFlagErr) {
            console.error("[stripe-webhook] Failed to write pendingRefunds for hold expired", refundFlagErr);
          }
          await writeOperationalAlert({
            type: "hold_expired_after_payment",
            holdId,
            paymentIntentId: piId,
            amount: piAmountTotal,
            currency: piCurrency,
            source: "stripe-webhook",
          });
          console.warn("[stripe-webhook] Hold expired after successful payment — flagged for refund", { holdId, paymentIntentId: piId });
          await writeEventResult(eventId, { status: "completed", processedAt: Timestamp.now(), outcome: "hold_expired_refund_flagged", holdId, paymentIntentId: piId, amountTotal: piAmountTotal, currency: piCurrency });
          return NextResponse.json({ received: true });
        } else {
          bookingError("stripe-webhook", "payment_intent.succeeded convertHoldToBooking failed", convertErr, { holdId, paymentIntentId: piId, error: errMsg });
          const attempt = await recordWebhookRetryAttempt(WH_RETRY_PI_SUCCEEDED_CONVERT_ERR);
          if (webhookTransientFailureShouldRetry(attempt)) {
            await writeEventResult(eventId, {
              status: "failed_retryable",
              processedAt: Timestamp.now(),
              error: errMsg,
              holdId,
              paymentIntentId: piId,
              amountTotal: piAmountTotal,
              currency: piCurrency,
            });
            return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
          }
          try {
            await upsertPendingRefundRecord(
              db,
              { reason: "pi_succeeded_convert_dead_letter", holdId, paymentIntentId: piId },
              {
                holdId,
                paymentIntentId: piId,
                amountTotal: piAmountTotal,
                currency: piCurrency,
                convertError: errMsg.slice(0, 500),
              }
            );
          } catch (e) {
            console.error("[stripe-webhook] pendingRefunds pi_succeeded_convert_dead_letter", e);
          }
          await writeOperationalAlert({
            type: "pi_succeeded_convert_dead_letter",
            holdId,
            paymentIntentId: piId,
            source: "stripe-webhook",
            attempt,
            error: errMsg.slice(0, 300),
          });
          await writeEventResult(eventId, {
            status: "failed_permanent",
            processedAt: Timestamp.now(),
            outcome: "pi_succeeded_convert_dead_letter",
            error: errMsg,
            holdId,
            paymentIntentId: piId,
            amountTotal: piAmountTotal,
            currency: piCurrency,
          });
          return NextResponse.json({ received: true });
        }
      }
    }

    if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const piId = pi.id;
      const paymentStage = pi.metadata?.payment_stage;
      const lastError = pi.last_payment_error as { code?: string; message?: string } | null;
      console.log("[stripe-webhook] payment_intent.payment_failed", {
        eventId,
        paymentIntentId: piId,
        paymentStage,
        code: lastError?.code,
      });
      let paymentFailedOutcome = "payment_failed_handled";
      const failedEventExtras: { paymentIntentId: string; bookingId?: string } = { paymentIntentId: piId };
      let finalFailureEmailAfterEvent: {
        bookingId: string;
        bookingData: Booking;
        requiresAction: boolean;
      } | null = null;
      // When the final_failed release transaction fails, we must retry the full webhook handler
      // so the release attempt can be made again.
      let releaseRetryErrMsg: string | null = null;

      if (paymentStage === "final") {
        const bookingId = pi.metadata?.bookingId;
        if (!bookingId) {
          paymentFailedOutcome = "final_payment_failed_missing_booking_id";
        } else {
          failedEventExtras.bookingId = bookingId;
          const bookingRef = db.collection("bookings").doc(bookingId);
          const bookingSnap = await bookingRef.get();
          if (!bookingSnap.exists) {
            paymentFailedOutcome = "final_payment_failed_booking_not_found";
          } else {
            const bookingData = bookingSnap.data() as Booking;
            const authoritativePiId = bookingData.stripe?.finalPaymentIntentId?.trim();
            const st = bookingData.status;

            if (st === "canceled" || st === "refunded") {
              paymentFailedOutcome = "final_payment_failed_terminal_booking_no_op";
              bookingLog("stripe-webhook", "payment_intent.payment_failed final ignored (booking canceled/refunded)", {
                bookingId,
                status: st,
              });
            } else if (st === "final_paid") {
              paymentFailedOutcome = "final_payment_failed_ignored_already_final_paid";
              bookingLog("stripe-webhook", "payment_intent.payment_failed final ignored (booking already final_paid)", {
                bookingId,
                paymentIntentId: piId,
              });
            } else if (authoritativePiId && authoritativePiId !== piId) {
              paymentFailedOutcome = "final_payment_failed_non_authoritative_no_mutation";
              try {
                await upsertPendingRefundRecord(
                  db,
                  {
                    reason: "final_webhook_failed_non_authoritative_pi",
                    bookingId,
                    paymentIntentId: piId,
                    expectedPaymentIntentId: authoritativePiId,
                  },
                  {
                    bookingId,
                    paymentIntentId: piId,
                    expectedPaymentIntentId: authoritativePiId,
                  }
                );
              } catch (refundFlagErr) {
                console.error("[stripe-webhook] Failed to write pendingRefunds for non-authoritative final failure", refundFlagErr);
              }
              await writeOperationalAlert({
                type: "final_webhook_failed_non_authoritative_pi",
                bookingId,
                paymentIntentId: piId,
                expectedPaymentIntentId: authoritativePiId,
                source: "stripe-webhook",
              });
              bookingLog("stripe-webhook", "payment_intent.payment_failed final ignored (non-authoritative PI)", {
                bookingId,
                eventPaymentIntentId: piId,
                storedPaymentIntentId: authoritativePiId,
              });
            } else if (!FINAL_PAYMENT_ACTIVE_STATUSES.has(st)) {
              paymentFailedOutcome = "final_payment_failed_unexpected_status_no_mutation";
              bookingLog("stripe-webhook", "payment_intent.payment_failed final ignored (unexpected status)", {
                bookingId,
                status: st,
              });
            } else if (authoritativePiId && authoritativePiId === piId) {
              const requiresAction =
                lastError?.code === "authentication_required" ||
                lastError?.code === "card_authentication_required" ||
                (typeof lastError?.message === "string" && lastError.message.toLowerCase().includes("authenticate"));
              const newStatus = requiresAction ? "final_requires_action" : "final_failed";
              type FinalFailTxResult =
                | { kind: "updated"; bookingData: Booking }
                | { kind: "noop"; outcome: string }
                | { kind: "slotReleaseNeeded"; bookingData: Booking };
              const txFail: FinalFailTxResult = await db.runTransaction(async (tx): Promise<FinalFailTxResult> => {
                const snap = await tx.get(bookingRef);
                if (!snap.exists) {
                  return { kind: "noop", outcome: "final_payment_failed_booking_not_found" };
                }
                const b = snap.data() as Booking;
                const stIn = b.status;
                const authIn = b.stripe?.finalPaymentIntentId?.trim();
                if (stIn === "canceled" || stIn === "refunded") {
                  return { kind: "noop", outcome: "final_payment_failed_terminal_booking_no_op" };
                }
                if (stIn === "final_paid") {
                  return { kind: "noop", outcome: "final_payment_failed_ignored_already_final_paid" };
                }
                if (authIn && authIn !== piId) {
                  return { kind: "noop", outcome: "final_payment_failed_non_authoritative_no_mutation" };
                }
                if (!FINAL_PAYMENT_ACTIVE_STATUSES.has(stIn)) {
                  return { kind: "noop", outcome: "final_payment_failed_unexpected_status_no_mutation" };
                }
                if (!authIn) {
                  return { kind: "noop", outcome: "final_payment_failed_no_authoritative_pi_no_mutation" };
                }
                if ((stIn === "final_failed" || stIn === "final_requires_action") && authIn === piId) {
                  if (stIn === "final_failed") {
                    const slotId = b.slotId;
                    const boatId = b.boatId;
                    const experienceId = b.experienceId;
                    if (slotId && (boatId || experienceId)) {
                      const slotRef = boatId
                        ? db.collection("boats").doc(boatId).collection("slots").doc(slotId)
                        : db.collection("experiences").doc(experienceId!).collection("slots").doc(slotId);
                      const slotSnap = await tx.get(slotRef);
                      if (slotSnap.exists) {
                        const slot = slotSnap.data() as Slot;
                        const slotStatus = slot.status;
                        const slotBookingId = typeof slot.bookingId === "string" ? slot.bookingId : "";
                        if (slotStatus === "booked" && slotBookingId === bookingId) {
                          return { kind: "slotReleaseNeeded", bookingData: b };
                        }
                      }
                    }
                  }
                  return { kind: "noop", outcome: "final_payment_failed_idempotent" };
                }
                tx.update(bookingRef, {
                  status: newStatus,
                  "stripe.finalError": { code: lastError?.code ?? undefined, message: lastError?.message ?? undefined },
                  "stripe.finalChargeAttemptedAt": Timestamp.now(),
                  updatedAt: FieldValue.serverTimestamp(),
                });
                return { kind: "updated", bookingData: b };
              });
              if (txFail.kind === "noop") {
                paymentFailedOutcome = txFail.outcome;
              } else if (txFail.kind === "slotReleaseNeeded") {
                paymentFailedOutcome = "final_payment_failed_slot_release_needed";
                if (!requiresAction) {
                  try {
                    await executeFinalFailedBookingReleaseTransaction(db, bookingId);
                    paymentFailedOutcome = "final_payment_failed_slot_released_after_idempotent_status";
                  } catch (releaseErr) {
                    const releaseErrMsg = releaseErr instanceof Error ? releaseErr.message : String(releaseErr);
                    await writeOperationalAlert({
                      type: "final_failed_release_transaction_failed",
                      source: "stripe-webhook",
                      bookingId,
                      paymentIntentId: piId,
                      lastError: releaseErrMsg.slice(0, 500),
                    });
                    paymentFailedOutcome = "final_payment_failed_slot_release_failed_after_idempotent_status";
                    releaseRetryErrMsg = releaseErrMsg;
                    console.error("[stripe-webhook] final_failed slot release retry failed", {
                      bookingId,
                      error: releaseErrMsg,
                    });
                  }
                }
                finalFailureEmailAfterEvent = {
                  bookingId,
                  bookingData: txFail.bookingData,
                  requiresAction,
                };
              } else {
                console.log("[stripe-webhook] payment_intent.payment_failed booking updated", { bookingId, newStatus });
                paymentFailedOutcome = "final_payment_failed_applied";
                if (!requiresAction) {
                  try {
                    // Definitive payment failure: release inventory immediately, do not wait for SLA cron.
                    await executeFinalFailedBookingReleaseTransaction(db, bookingId);
                    paymentFailedOutcome = "final_payment_failed_applied_and_released";
                  } catch (releaseErr) {
                    const releaseErrMsg = releaseErr instanceof Error ? releaseErr.message : String(releaseErr);
                    // Critical: if we cannot release the slot, we must let Stripe retry the webhook so we can attempt release again.
                    await writeOperationalAlert({
                      type: "final_failed_release_transaction_failed",
                      source: "stripe-webhook",
                      bookingId,
                      paymentIntentId: piId,
                      lastError: releaseErrMsg.slice(0, 500),
                    });
                    // Mark for retry below (event status + HTTP response).
                    paymentFailedOutcome = "final_payment_failed_applied_release_failed";
                    releaseRetryErrMsg = releaseErrMsg;
                    console.error("[stripe-webhook] immediate final_failed release failed", {
                      bookingId,
                      error: releaseErrMsg,
                    });
                  }
                }
                finalFailureEmailAfterEvent = {
                  bookingId,
                  bookingData: txFail.bookingData,
                  requiresAction,
                };
              }
            } else if (!authoritativePiId) {
              paymentFailedOutcome = "final_payment_failed_no_authoritative_pi_no_mutation";
              bookingLog("stripe-webhook", "payment_intent.payment_failed final ignored (no authoritative PI on booking)", {
                bookingId,
                paymentIntentId: piId,
              });
              await writeOperationalAlert({
                type: "final_payment_failed_no_authoritative_pi_recorded",
                bookingId,
                paymentIntentId: piId,
                source: "stripe-webhook",
              });
            }
          }
        }
      }

      const releaseRetryErr =
        typeof releaseRetryErrMsg === "string" && releaseRetryErrMsg.trim().length > 0 ? releaseRetryErrMsg : undefined;
      const shouldRetryRelease = releaseRetryErr != null;
      await writeEventResult(eventId, {
        status: shouldRetryRelease ? "failed_retryable" : "completed",
        processedAt: Timestamp.now(),
        outcome: paymentFailedOutcome,
        ...(shouldRetryRelease ? { error: releaseRetryErr } : {}),
        ...failedEventExtras,
      });
      if (finalFailureEmailAfterEvent) {
        const { bookingId: bid, bookingData: bd, requiresAction: reqAct } = finalFailureEmailAfterEvent;
        const shouldSend = await tryBeginFinalFailureNotificationSend(db, bid, piId);
        if (shouldSend) {
          try {
            let manageLink: string | undefined;
            const custEmail = bd.customer?.email?.trim();
            if (bookingEnv.manageBookingSecret && custEmail) {
              const token = signManageToken({
                bookingId: bid,
                tripDateStr: bd.startDateStr,
              });
              if (token) manageLink = `${bookingEnv.appBaseUrl}/booking/manage?token=${encodeURIComponent(token)}`;
            }
            let experienceNameFf = "Your trip";
            if (bd.experienceId) {
              const exFf = await db.collection("experiences").doc(bd.experienceId).get();
              if (exFf.exists) experienceNameFf = (exFf.data() as { title?: string }).title ?? experienceNameFf;
            }
            let startTimeFf = "";
            if (bd.slotId) {
              const parsedFf = parseSlotId(bd.slotId.trim());
              if (parsedFf) {
                const tripStartFf = getSlotStartEnd(
                  parsedFf.dateStr,
                  parsedFf.startHour,
                  parsedFf.durationHours ?? 2,
                  parsedFf.startMinute ?? 0,
                ).start;
                startTimeFf = tripStartFf.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: "America/Chicago",
                });
              }
            }
            await sendFinalChargeFailedEmail(bd.customer.email, bd.customer.name, manageLink, reqAct, {
              experienceName: experienceNameFf,
              tripDate: bd.startDateStr ?? "",
              startTime: startTimeFf,
            });
            const subject = reqAct
              ? "Action needed to complete your booking – Boat Bros ATX"
              : "Payment failed for your upcoming trip – Boat Bros ATX";
            await logNotificationSent({
              channel: "email",
              to: bd.customer.email,
              toName: bd.customer.name,
              templateId: "final_charge_failed",
              subject,
              bookingId: bid,
              eventSubtype: "final_charge_failed",
            }).catch((err) => console.error("[stripe-webhook] logNotificationSent failed", err));
            await finalizeFinalFailureNotification(db, bid, piId);
          } catch (emailErr) {
            console.error("[stripe-webhook] final charge failed email error", emailErr);
            await clearFinalFailureNotificationLease(db, bid).catch((clearErr) =>
              console.error("[stripe-webhook] clearFinalFailureNotificationLease failed", clearErr)
            );
          }
        }
      }
      if (shouldRetryRelease) {
        return NextResponse.json({ error: "Final release failed; Stripe will retry webhook" }, { status: 500 });
      }
      return NextResponse.json({ received: true });
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
        await db.runTransaction(async (tx) => {
          const ref = db.collection("stripeEvents").doc(stripeEventId);
          const snap = await tx.get(ref);
          if (snap.exists && (snap.data() as { status?: string })?.status === "completed") return;
          tx.set(ref, payload, { merge: true });
        });
      } catch (_) {
        // ignore
      }
    }
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
