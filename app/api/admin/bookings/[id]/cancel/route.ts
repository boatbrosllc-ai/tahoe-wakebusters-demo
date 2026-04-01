/**
 * POST /api/admin/bookings/[id]/cancel
 * Cancel a booking (set status to "canceled") and release the slot so it becomes available again.
 * Optionally issues a Stripe refund when the booking has a payment intent. Requires admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminEmailFromSessionCookie, requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { parseSlotId, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { getStripe } from "@/lib/booking/stripe-client";
import { tryClaimSend, markClaimSent, markClaimFailed } from "@/lib/booking/notification-claim";
import { suppressPendingOutboxForBookingOnCancel } from "@/lib/booking/notification-outbox";
import { sendPendingRefundPermanentFailureAlert } from "@/lib/booking/brevo";
import type { Booking, BookingCancellationRefundStatus } from "@/lib/booking/types";
import {
  applyExperienceRevenueDelta,
  totalSummaryAttributedRevenueCents,
} from "@/lib/booking/summary-revenue";
import type { DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { pendingRefundDocumentId } from "@/lib/booking/pending-refund-idempotent";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { buildAdminCancelRefundIdempotencyKey } from "@/lib/booking/stripe-idempotency-keys";
import {
  classifyStripeRefundStatus,
  PENDING_STRIPE_REFUND_POLL_MS,
} from "@/lib/booking/stripe-refund-status";
import { resetBookingSlotsToOpenInTransaction } from "@/lib/booking/slot-reset";
import { resolveExperienceDocAndSlug } from "@/lib/booking/listing-boat-resolution";
import { writeAdminAuditLog } from "@/lib/booking/admin-audit-log";
import {
  getDepartureInventoryRef,
  releaseCapacityWithPreRead,
} from "@/lib/booking/shared-departure-inventory";

const CANCELLATION_TEMPLATE_KEY = "booking_cancellation";

type CancellationRefundOutcome = "succeeded" | "pending" | "failed" | "skipped";

function deriveCancellationRefundOutcome(params: {
  refundRequested: boolean;
  distinctIds: string[];
  refunds: Array<{ paymentIntentId: string; status?: string; error?: string }>;
  skippedRefunds: Array<{ paymentIntentId: string; reason: string }>;
}): CancellationRefundOutcome {
  if (!params.refundRequested) return "skipped";
  if (params.distinctIds.length === 0) return "skipped";
  const { refunds, skippedRefunds } = params;
  if (skippedRefunds.length > 0 && refunds.length === 0) return "failed";
  const succeeded = refunds.filter((r) => !r.error && r.status === "succeeded");
  const pending = refunds.filter((r) => !r.error && r.status === "pending");
  const failed = refunds.filter((r) => r.error);
  const allSucceeded =
    succeeded.length > 0 &&
    params.distinctIds.every((id) => succeeded.some((r) => r.paymentIntentId === id));
  if (allSucceeded) return "succeeded";
  if (pending.length > 0) return "pending";
  if (failed.length > 0) return "failed";
  if (succeeded.length > 0 && (pending.length > 0 || failed.length > 0)) return "pending";
  if (succeeded.length > 0 && skippedRefunds.length > 0) return "pending";
  return "failed";
}

function getDistinctStripePaymentIntentIds(b: Booking): string[] {
  const intentIds = [
    b.stripe?.paymentIntentId,
    b.stripe?.depositPaymentIntentId,
    b.stripe?.finalPaymentIntentId,
  ].filter((id): id is string => typeof id === "string" && id.length > 0);
  return Array.from(new Set(intentIds));
}

function shouldAdjustSummaryForCancel(b: Booking): boolean {
  const revenueCentsPre = totalSummaryAttributedRevenueCents(b);
  const bookingExtPre = b as Booking & { summaryCountersApplied?: boolean; holdId?: string };
  return (
    revenueCentsPre > 0 &&
    (bookingExtPre.summaryCountersApplied === true ||
      !!bookingExtPre.holdId ||
      !!b.stripe?.paymentIntentId ||
      !!b.stripe?.depositPaymentIntentId)
  );
}

function isAdminCancelRefundResumable(b: Booking, refundRequested: boolean): boolean {
  if (b.status !== "canceled" || !refundRequested) return false;
  const st = b.cancellationRefund?.status;
  return st === "pending" || st === "partial" || st === "failed";
}

function parseBody(body: unknown): { refund?: boolean; overridePolicy?: boolean } {
  if (body == null || typeof body !== "object") return { refund: true, overridePolicy: false };
  const o = body as Record<string, unknown>;
  const refund = o.refund;
  if (refund === false) return { refund: false };
  return { refund: true, overridePolicy: o.overridePolicy === true };
}

function getPolicyCutoffHours(policy: { noRefundAfterHours?: number; noRefundWithinDays?: number } | undefined): number | null {
  if (!policy) return null;
  if (typeof policy.noRefundAfterHours === "number") return policy.noRefundAfterHours;
  if (typeof policy.noRefundWithinDays === "number") return policy.noRefundWithinDays * 24;
  return null;
}

async function isPastNoRefundCutoff(db: Firestore, booking: Booking): Promise<boolean> {
  const experienceId = booking.experienceId;
  const slotId = booking.slotId;
  if (!experienceId || !slotId) return false;
  try {
    const parsedSlot = parseSlotId(slotId);
    if (!parsedSlot) return false;
    const bookingPolicy = booking.cancellationPolicy as
      | { noRefundAfterHours?: number; noRefundWithinDays?: number }
      | undefined;
    let cutoffHours = getPolicyCutoffHours(bookingPolicy);
    if (cutoffHours == null) {
      const expSnap = await db.collection("experiences").doc(experienceId).get();
      if (!expSnap.exists) return false;
      const exp = expSnap.data() as { cancellationPolicy?: { noRefundAfterHours?: number; noRefundWithinDays?: number } };
      cutoffHours = getPolicyCutoffHours(exp.cancellationPolicy);
    }
    if (cutoffHours == null) return false;
    const { start: departureStart } = getSlotStartEnd(
      parsedSlot.dateStr,
      parsedSlot.startHour,
      parsedSlot.durationHours,
      parsedSlot.startMinute ?? 0
    );
    const cutoff = new Date(departureStart.getTime() - cutoffHours * 60 * 60 * 1000);
    return new Date() > cutoff;
  } catch {
    return false;
  }
}

async function updateCancellationRefundStatusIfCanceled(
  db: Firestore,
  bookingRef: FirebaseFirestore.DocumentReference,
  status: BookingCancellationRefundStatus,
  Timestamp: { now: () => FirebaseFirestore.Timestamp }
): Promise<void> {
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(bookingRef);
    if (!snap.exists) return;
    const booking = snap.data() as Booking;
    if (booking.status !== "canceled") return;
    tx.update(bookingRef, {
      cancellationRefund: {
        status,
        ...(status === "succeeded" ? { summaryAppliedAt: Timestamp.now() } : {}),
      },
    });
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id: bookingId } = await params;
  if (!bookingId) return NextResponse.json({ error: "Missing booking id" }, { status: 400 });

  let body: { refund?: boolean; overridePolicy?: boolean } = { refund: true, overridePolicy: false };
  try {
    body = parseBody(await request.json().catch(() => ({})));
  } catch {
    // keep default
  }

  let expSnapForName: DocumentSnapshot | null = null;
  let tripDateStr: string | undefined = undefined;

  try {
    const db = getDb();
    const { FieldValue, Timestamp } = getFirestoreExports();
    const bookingRef = db.collection("bookings").doc(bookingId);
    const bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    const booking = bookingSnap.data() as Booking;
    if (booking.status === "refunded") {
      return NextResponse.json({ ok: true, already: true, slotReleased: false });
    }

    const isResume = isAdminCancelRefundResumable(booking, body.refund !== false);
    const distinctIdsPreflight = getDistinctStripePaymentIntentIds(booking);
    if (
      !isResume &&
      body.refund !== false &&
      distinctIdsPreflight.length > 0 &&
      (await isPastNoRefundCutoff(db, booking)) &&
      !body.overridePolicy
    ) {
      return NextResponse.json(
        {
          error:
            "The no-refund window for this trip may have passed. To cancel and issue Stripe refunds anyway, resend with { \"overridePolicy\": true }. To cancel without refunding, use { \"refund\": false }.",
          code: "NO_REFUND_WINDOW_REQUIRES_CONFIRMATION",
        },
        { status: 409 }
      );
    }

    if (booking.status === "canceled" && !isResume) {
      return NextResponse.json({ ok: true, already: true, slotReleased: false });
    }

    const experienceId = booking.experienceId;
    const boatId = booking.boatId;
    const slotId = booking.slotId;

    tripDateStr = booking.startDateStr ?? parseSlotId(slotId ?? "")?.dateStr;
    expSnapForName = experienceId ? await db.collection("experiences").doc(experienceId).get() : null;
    const expResolved = await resolveExperienceDocAndSlug(db, booking.experienceId);

    /** Must match increments in convert-hold (deposit + optional final), webhook/cron final, and admin POST. */
    const revenueCentsPre = totalSummaryAttributedRevenueCents(booking);
    const shouldAdjustSummaryPre = shouldAdjustSummaryForCancel(booking);
    if (revenueCentsPre > 0 && !shouldAdjustSummaryPre) {
      console.warn("[admin/cancel] revenueCents > 0 but summary adjustment skipped — possible legacy booking; manual summary correction may be needed", {
        bookingId,
        revenueCents: revenueCentsPre,
      });
      void writeOperationalAlert({
        type: "admin_cancel_summary_adjustment_skipped",
        bookingId,
        revenueCents: revenueCentsPre,
        source: "admin-cancel",
      });
    }

    const expPricingTypeForCancel = expSnapForName?.exists
      ? ((expSnapForName.data() as { pricingType?: string })?.pricingType ?? "")
      : "";

    const cancelTxOutcome = {
      concurrentCanceled: false,
      slotReleased: false,
      heldSlotsReleased: 0,
      distinctIds: getDistinctStripePaymentIntentIds(booking),
      shouldAdjustSummary: false,
      slotResetPending: false,
      noSlotRefForBooking: false,
    };

    let slotReleased = false;
    let heldSlotsReleased = 0;
    let distinctIds: string[] = getDistinctStripePaymentIntentIds(booking);
    let shouldAdjustSummary = false;
    let concurrentCanceled = false;
    let pendingRefundIds: string[] = [];

    if (!isResume) {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(bookingRef);
        if (!snap.exists) return;
        const b = snap.data() as Booking;
        if (b.status === "canceled" || b.status === "refunded") {
          cancelTxOutcome.concurrentCanceled = true;
          return;
        }

        const revenueCents = totalSummaryAttributedRevenueCents(b);
        cancelTxOutcome.shouldAdjustSummary = shouldAdjustSummaryForCancel(b);

        const createdAt = (b as { createdAt?: { toDate?: () => Date } }).createdAt;
        const createdDate = createdAt?.toDate?.();
        const monthKeyStored = typeof b.summaryMonthKey === "string" ? b.summaryMonthKey.trim() : "";
        const monthKey = monthKeyStored
          ? monthKeyStored
          : createdDate
            ? `revenue_${createdDate.getFullYear()}_${String(createdDate.getMonth() + 1).padStart(2, "0")}`
            : null;

        cancelTxOutcome.distinctIds = getDistinctStripePaymentIntentIds(b);

        const bExpId = typeof b.experienceId === "string" ? b.experienceId.trim() : "";
        const bBoatId = typeof b.boatId === "string" ? b.boatId.trim() : "";
        cancelTxOutcome.slotResetPending = !!(slotId && !bExpId && !bBoatId);

        const departureInventoryPreRead = {
          current: null as { ref: FirebaseFirestore.DocumentReference; reserved: number } | null,
        };

        /** Inventory must be read with booking — not between slot reads and slot writes (Firestore read-before-write rule). */
        const expIdForInventory = (expResolved?.docId?.trim() || bExpId || "").trim();
        if (b.bookingMode === "shared" && expPricingTypeForCancel === "ticketed" && expIdForInventory) {
          const oldDateStrInv = typeof b.startDateStr === "string" ? b.startDateStr.trim() : "";
          if (oldDateStrInv) {
            const invRef = getDepartureInventoryRef(db, expIdForInventory, oldDateStrInv);
            const invSnap = await tx.get(invRef);
            departureInventoryPreRead.current = {
              ref: invRef,
              reserved: invSnap.exists
                ? ((invSnap.data() as { reservedSeats?: number }).reservedSeats ?? 0)
                : 0,
            };
          }
        }

        if (slotId && bExpId) {
          const bookingForReset = expResolved ? ({ ...b, experienceId: expResolved.docId } as Booking) : b;
          const releasedCount = await resetBookingSlotsToOpenInTransaction(
            db,
            tx,
            bookingId,
            bookingForReset,
            expResolved?.slug ?? ""
          );
          if (releasedCount.updated > 0) cancelTxOutcome.slotReleased = true;
          cancelTxOutcome.heldSlotsReleased += releasedCount.heldSlotsReleased;
          if (departureInventoryPreRead.current) {
            const inv = departureInventoryPreRead.current;
            releaseCapacityWithPreRead(tx, inv.ref, b.partySize, inv.reserved);
          }
        } else if (slotId && bBoatId) {
          const releasedBoatOnly = await resetBookingSlotsToOpenInTransaction(db, tx, bookingId, b, "");
          if (releasedBoatOnly.updated > 0) cancelTxOutcome.slotReleased = true;
          cancelTxOutcome.heldSlotsReleased += releasedBoatOnly.heldSlotsReleased;
          if (departureInventoryPreRead.current) {
            const inv = departureInventoryPreRead.current;
            releaseCapacityWithPreRead(tx, inv.ref, b.partySize, inv.reserved);
          }
        } else if (slotId) {
          cancelTxOutcome.noSlotRefForBooking = true;
        }

        const cancellationRefund = !body.refund
          ? ({
              status: "skipped" as const,
              ...(cancelTxOutcome.shouldAdjustSummary ? { summaryAppliedAt: Timestamp.now() } : {}),
            })
          : ({
              status: "pending" as const,
              ...(cancelTxOutcome.shouldAdjustSummary ? { summaryAppliedAt: Timestamp.now() } : {}),
            });

        if (body.refund !== false && cancelTxOutcome.distinctIds.length > 0) {
          for (const piId of cancelTxOutcome.distinctIds) {
            const prId = pendingRefundDocumentId({
              reason: "admin_cancel_refund_pending",
              bookingId,
              paymentIntentId: piId,
            });
            const prRef = db.collection("pendingRefunds").doc(prId);
            tx.set(
              prRef,
              {
                bookingId,
                paymentIntentId: piId,
                reason: "admin_cancel_refund_pending",
                status: "pending",
                createdAt: Timestamp.now(),
                firstSeenAt: Timestamp.now(),
                lastSeenAt: Timestamp.now(),
                occurrences: 1,
                nextRetryAt: Timestamp.now(),
                processorAttempts: 0,
              },
              { merge: true }
            );
          }
        }

        tx.update(bookingRef, {
          status: "canceled",
          updatedAt: FieldValue.serverTimestamp(),
          cancellationRefund,
          ...(cancelTxOutcome.slotResetPending ? { slotResetPending: true } : {}),
        });

        if (cancelTxOutcome.shouldAdjustSummary) {
          const summaryRef = db.collection("summaries").doc("revenue");
          tx.set(summaryRef, {
            totalRevenueCents: FieldValue.increment(-revenueCents),
            bookingCount: FieldValue.increment(-1),
          }, { merge: true });
          if (monthKey) {
            const monthRef = db.collection("summaries").doc(monthKey);
            tx.set(monthRef, {
              revenueCents: FieldValue.increment(-revenueCents),
              bookingCount: FieldValue.increment(-1),
            }, { merge: true });
          }
          if (bExpId) {
            applyExperienceRevenueDelta(tx, db, FieldValue, bExpId, -revenueCents, -1);
          }
        }

      });
      slotReleased = cancelTxOutcome.slotReleased;
      heldSlotsReleased = cancelTxOutcome.heldSlotsReleased;
      distinctIds = cancelTxOutcome.distinctIds;
      shouldAdjustSummary = cancelTxOutcome.shouldAdjustSummary;
      concurrentCanceled = cancelTxOutcome.concurrentCanceled;
      if (body.refund !== false && cancelTxOutcome.distinctIds.length > 0) {
        pendingRefundIds = Array.from(
          new Set(
            cancelTxOutcome.distinctIds.map((piId) =>
              pendingRefundDocumentId({
                reason: "admin_cancel_refund_pending",
                bookingId,
                paymentIntentId: piId,
              })
            )
          )
        );
      }
      if (cancelTxOutcome.noSlotRefForBooking) {
        console.warn("[admin/cancel] no slot ref for booking — possible missing boatId/experienceId; backfill may be needed", {
          bookingId,
          experienceId,
          boatId,
          slotId,
        });
        void writeOperationalAlert({
          type: "admin_cancel_no_slot_ref",
          source: "admin-cancel",
          bookingId,
          experienceId: experienceId ?? null,
          boatId: boatId ?? null,
          slotId,
          hint: "Could not resolve Firestore path for slot document; investigate and backfill boatId/experienceId on booking.",
        }).catch(() => {});
      }
    } else {
      distinctIds = getDistinctStripePaymentIntentIds(booking);
      shouldAdjustSummary = !!booking.cancellationRefund?.summaryAppliedAt;
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(bookingRef);
        if (!snap.exists) return;
        const b = snap.data() as Booking;
        if (b.status !== "canceled") return;
        if (body.refund === false || distinctIds.length === 0) return;
        for (const piId of distinctIds) {
          const prId = pendingRefundDocumentId({
            reason: "admin_cancel_refund_pending",
            bookingId,
            paymentIntentId: piId,
          });
          const prRef = db.collection("pendingRefunds").doc(prId);
          tx.set(
            prRef,
            {
              bookingId,
              paymentIntentId: piId,
              reason: "admin_cancel_refund_pending",
              status: "pending",
              lastSeenAt: Timestamp.now(),
              nextRetryAt: Timestamp.now(),
            },
            { merge: true }
          );
        }
      });
      if (body.refund !== false && distinctIds.length > 0) {
        pendingRefundIds = Array.from(
          new Set(
            distinctIds.map((piId) =>
              pendingRefundDocumentId({
                reason: "admin_cancel_refund_pending",
                bookingId,
                paymentIntentId: piId,
              })
            )
          )
        );
      }
    }

    if (!isResume) {
      await suppressPendingOutboxForBookingOnCancel(db, bookingId);
    }

    if (!isResume && concurrentCanceled) {
      return NextResponse.json({ ok: true, already: true, slotReleased: false });
    }
    if (heldSlotsReleased > 0) {
      void writeOperationalAlert({
        type: "admin_cancel_slot_held_released",
        source: "admin-cancel",
        bookingId,
        releasedHeldSlotCount: heldSlotsReleased,
      }).catch(() => {});
    }

    let refunds: Array<{
      paymentIntentId: string;
      id?: string;
      status?: string;
      amount?: number;
      error?: string;
      amountReceived?: number;
      amountRefundedBefore?: number;
      refundAmountCents?: number;
      priorPartialRefund?: boolean;
    }> = [];
    const skippedRefunds: Array<{ paymentIntentId: string; reason: string }> = [];
    let refundPreviouslyRefundedTotalCents = 0;
    let refundExpectedTotalCents = 0;
    let refundIssuedThisRequestCents = 0;
    let priorPartialRefundDetected = false;
    if (body.refund !== false && process.env.STRIPE_SECRET_KEY) {
      const stripe = getStripe();
      for (const piId of distinctIds) {
        const prId = pendingRefundDocumentId({
          reason: "admin_cancel_refund_pending",
          bookingId,
          paymentIntentId: piId,
        });
        const prRef = db.collection("pendingRefunds").doc(prId);
        try {
          const pi = await stripe.paymentIntents.retrieve(piId);
          if (pi.status !== "succeeded") {
            skippedRefunds.push({
              paymentIntentId: piId,
              reason: `PaymentIntent status is '${pi.status}', not 'succeeded'; skipping refund`,
            });
            continue;
          }
          const piAmt = pi as unknown as { amount_received?: number; amount_refunded?: number };
          const amountReceived = typeof piAmt.amount_received === "number" ? piAmt.amount_received : 0;
          const amountRefundedBefore = typeof piAmt.amount_refunded === "number" ? piAmt.amount_refunded : 0;
          refundExpectedTotalCents += amountReceived;
          refundPreviouslyRefundedTotalCents += amountRefundedBefore;
          const remainingRefundable = Math.max(0, amountReceived - amountRefundedBefore);
          const hadPriorPartial = amountRefundedBefore > 0;
          if (hadPriorPartial) priorPartialRefundDetected = true;
          if (remainingRefundable <= 0) {
            skippedRefunds.push({
              paymentIntentId: piId,
              reason:
                "No remaining refundable balance on PaymentIntent (amount_received minus amount_refunded is zero or negative)",
            });
            continue;
          }
          const refund = await stripe.refunds.create(
            { payment_intent: piId, amount: remainingRefundable },
            { idempotencyKey: buildAdminCancelRefundIdempotencyKey(prId) }
          );
          const issued = refund.amount ?? remainingRefundable;
          refundIssuedThisRequestCents += issued;
          refunds.push({
            paymentIntentId: piId,
            id: refund.id,
            status: refund.status ?? undefined,
            amount: refund.amount ?? undefined,
            amountReceived,
            amountRefundedBefore,
            refundAmountCents: issued,
            priorPartialRefund: hadPriorPartial,
          });
          const outcome = classifyStripeRefundStatus(refund.status ?? undefined);
          if (outcome === "terminal_success") {
            await prRef.update({
              status: "resolved",
              resolvedAt: Timestamp.now(),
              stripeRefundId: refund.id,
              lastProcessorError: FieldValue.delete(),
              nextRetryAt: FieldValue.delete(),
            });
          } else if (outcome === "terminal_failure") {
            const msg = `${refund.failure_reason ?? refund.status ?? "failed"}`.slice(0, 1000);
            const failIdx = refunds.length - 1;
            if (failIdx >= 0 && refunds[failIdx]?.paymentIntentId === piId) {
              refunds[failIdx] = { ...refunds[failIdx], error: msg };
            }
            await prRef.update({
              status: "failed",
              stripeRefundId: refund.id,
              lastProcessorError: msg,
              nextRetryAt: FieldValue.delete(),
            });
            void writeOperationalAlert({
              type: "pending_refund_processor_permanent_failure",
              source: "admin-cancel",
              pendingRefundId: prId,
              paymentIntentId: piId,
              reason: "admin_cancel_refund_pending",
              error: msg.slice(0, 500),
            });
            void sendPendingRefundPermanentFailureAlert({
              pendingRefundId: prId,
              paymentIntentId: piId,
              reason: "admin_cancel_refund_pending",
              error: msg.slice(0, 500),
            });
          } else {
            await prRef.update({
              status: "pending",
              stripeRefundId: refund.id,
              lastProcessorError: FieldValue.delete(),
              nextRetryAt: Timestamp.fromDate(new Date(Date.now() + PENDING_STRIPE_REFUND_POLL_MS)),
            });
          }
        } catch (refundErr) {
          const msg = refundErr instanceof Error ? refundErr.message : String(refundErr);
          console.error("[admin/cancel] Stripe refund failed", { bookingId, piId }, refundErr);
          refunds.push({ paymentIntentId: piId, error: msg });
          try {
            await prRef.update({
              lastProcessorError: msg.slice(0, 1000),
            });
          } catch (pendingErr) {
            console.error("[admin/cancel] Failed to update pendingRefunds", pendingErr);
          }
        }
      }
    }

    if (body.refund && shouldAdjustSummary) {
      if (distinctIds.length === 0) {
        await updateCancellationRefundStatusIfCanceled(db, bookingRef, "succeeded", Timestamp);
      } else {
        const allSucceeded = distinctIds.every((piId) => {
          const r = refunds.find((x) => x.paymentIntentId === piId);
          return Boolean(r && !r.error && r.status === "succeeded");
        });
        if (allSucceeded) {
          await updateCancellationRefundStatusIfCanceled(db, bookingRef, "succeeded", Timestamp);
        } else {
          const anySucceeded = refunds.some((r) => !r.error && r.status === "succeeded");
          const anyFailure = refunds.some((r) => r.error) || skippedRefunds.length > 0;
          let st: BookingCancellationRefundStatus = "pending";
          if (anySucceeded) st = "partial";
          else if (anyFailure) st = "failed";
          await updateCancellationRefundStatusIfCanceled(db, bookingRef, st, Timestamp);
        }
      }
    } else if (body.refund && !shouldAdjustSummary) {
      await updateCancellationRefundStatusIfCanceled(db, bookingRef, "skipped", Timestamp);
    }

    const experienceName = expSnapForName?.exists ? (expSnapForName.data() as { title?: string })?.title ?? "Your trip" : "Your trip";

    const refundOutcome = deriveCancellationRefundOutcome({
      refundRequested: body.refund !== false,
      distinctIds,
      refunds,
      skippedRefunds,
    });

    const bookingExtNotify = booking as { cancellationNotifiedAt?: unknown };
    const skipCancellationEmail = isResume && bookingExtNotify.cancellationNotifiedAt != null;

    if (!skipCancellationEmail) {
      const cancellationClaimed = await tryClaimSend(db, bookingId, CANCELLATION_TEMPLATE_KEY);
      if (cancellationClaimed) {
      try {
        const { sendBookingCancellationEmail } = await import("@/lib/booking/brevo");
        const { formatMoney } = await import("@/lib/booking/format-money");
        const succeededRefunds = refunds.filter((r) => r.status === "succeeded" && r.amount != null);
        const totalConfirmedCents = succeededRefunds.reduce((sum, r) => sum + (r.amount ?? 0), 0);
        const refundAmount = totalConfirmedCents > 0 ? formatMoney(totalConfirmedCents) : undefined;
        const pendingRefunds = refunds.filter((r) => r.status === "pending");
        const refundPending = pendingRefunds.length > 0;
        const pendingRefundAmount =
          refundPending && pendingRefunds.some((r) => r.amount != null)
            ? formatMoney(pendingRefunds.reduce((sum, r) => sum + (r.amount ?? 0), 0))
            : undefined;
        await sendBookingCancellationEmail({
          to: booking.customer?.email ?? "",
          customerName: booking.customer?.name ?? "Guest",
          experienceName,
          tripDate: tripDateStr ?? undefined,
          refundAmount,
          refundPending,
          pendingRefundAmount,
          refundOutcome,
        });
        const { logNotificationSent } = await import("@/lib/booking/email-log");
        await logNotificationSent({
          channel: "email",
          to: booking.customer?.email ?? "",
          toName: booking.customer?.name,
          templateId: "booking_cancellation",
          subject: "Booking canceled – Boat Bros ATX",
          bookingId,
          eventSubtype: "booking_cancellation",
        }).catch((err) => console.error("[admin/cancel] logNotificationSent failed", err));
        if (booking.customer?.phone?.trim()) {
          const { sendBookingCancellationSms } = await import("@/lib/booking/sms");
          const smsSent = await sendBookingCancellationSms({
            phone: booking.customer.phone,
            customerName: booking.customer?.name ?? "Guest",
            experienceName,
            tripDate: tripDateStr ?? undefined,
            bookingId,
            refundOutcome,
            ...(refundOutcome === "succeeded" && refundAmount ? { refundAmountFormatted: refundAmount } : {}),
          });
          if (smsSent) {
            await bookingRef.update({ cancellationSmsSentAt: Timestamp.now() });
          }
        }
        await markClaimSent(db, bookingId, CANCELLATION_TEMPLATE_KEY);
        await bookingRef.update({ cancellationNotifiedAt: Timestamp.now() });
      } catch (notifyErr) {
        const errMsg = notifyErr instanceof Error ? notifyErr.message : String(notifyErr);
        await markClaimFailed(db, bookingId, CANCELLATION_TEMPLATE_KEY, errMsg);
        console.error("[admin/cancel] Cancellation notification failed", bookingId, notifyErr);
      }
      }
    }

    let cancellationPolicyWarning: string | undefined;
    const expId = booking.experienceId;
    if (expId) {
      try {
        const parsedSlot = slotId ? parseSlotId(slotId) : null;
        if (parsedSlot) {
          const bookingPolicy = booking.cancellationPolicy as
            | { noRefundAfterHours?: number; noRefundWithinDays?: number }
            | undefined;
          let cutoffHours = getPolicyCutoffHours(bookingPolicy);
          if (cutoffHours == null) {
            const expSnap = await db.collection("experiences").doc(expId).get();
            if (expSnap.exists) {
              const exp = expSnap.data() as { cancellationPolicy?: { noRefundAfterHours?: number; noRefundWithinDays?: number } };
              cutoffHours = getPolicyCutoffHours(exp.cancellationPolicy);
              void writeAdminAuditLog("booking_cancel_policy_fallback_live_experience", {
                bookingId,
                experienceId: expId,
              });
            }
          }
          if (cutoffHours != null) {
          const { start: departureStart } = getSlotStartEnd(
            parsedSlot.dateStr,
            parsedSlot.startHour,
            parsedSlot.durationHours,
            parsedSlot.startMinute ?? 0
          );
          const cutoff = new Date(departureStart.getTime() - cutoffHours * 60 * 60 * 1000);
          if (new Date() > cutoff) {
            cancellationPolicyWarning = "No-refund window may have passed per booking cancellation policy snapshot.";
          }
        }
        }
      } catch {
        // non-fatal; omit warning
      }
    }

    const adminEmail = await getAdminEmailFromSessionCookie(request.headers.get("cookie"));
    void writeAdminAuditLog("booking_cancel", {
      bookingId,
      overridePolicy: body.overridePolicy === true,
      refundRequested: body.refund !== false,
      paymentIntentIdsAtCancel: distinctIds,
      refundResults: refunds.map((r) => ({ paymentIntentId: r.paymentIntentId, status: r.status ?? null, error: r.error ?? null })),
      adminEmail,
    });

    const refundFailureCount = refunds.filter((r) => r.error).length;
    const refundPartialFailure =
      body.refund !== false &&
      distinctIds.length > 0 &&
      refundFailureCount > 0 &&
      !refunds.every((r) => r.error);

    return NextResponse.json({
      ok: true,
      slotReleased,
      refunds,
      pendingRefundIds,
      ...(body.refund !== false &&
        distinctIds.length > 0 && {
          refundLedger: {
            expectedTotalChargeCents: refundExpectedTotalCents,
            previouslyRefundedTotalCents: refundPreviouslyRefundedTotalCents,
            refundedThisRequestCents: refundIssuedThisRequestCents,
          },
        }),
      ...(priorPartialRefundDetected && { priorPartialRefundDetected: true as const }),
      ...(refundPartialFailure && { refundPartialFailure: true as const }),
      ...(skippedRefunds.length > 0 && { skippedRefunds }),
      ...(cancellationPolicyWarning && { cancellationPolicyWarning }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
