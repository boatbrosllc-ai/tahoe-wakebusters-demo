/**
 * POST /api/admin/bookings/[id]/cancel
 * Cancel a booking (set status to "canceled") and release the slot so it becomes available again.
 * Optionally issues a Stripe refund when the booking has a payment intent. Requires admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { parseSlotId, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { getStripe } from "@/lib/booking/stripe-client";
import { tryClaimSend, markClaimSent, markClaimFailed } from "@/lib/booking/notification-claim";
import { sendPendingRefundPermanentFailureAlert } from "@/lib/booking/brevo";
import type { Booking, BookingCancellationRefundStatus } from "@/lib/booking/types";
import { totalSummaryAttributedRevenueCents } from "@/lib/booking/summary-revenue";
import type { DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { pendingRefundDocumentId } from "@/lib/booking/pending-refund-idempotent";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { buildAdminCancelRefundIdempotencyKey } from "@/lib/booking/stripe-idempotency-keys";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { getDepartureInventoryRef } from "@/lib/booking/shared-departure-inventory";
import {
  classifyStripeRefundStatus,
  PENDING_STRIPE_REFUND_POLL_MS,
} from "@/lib/booking/stripe-refund-status";

const CANCELLATION_TEMPLATE_KEY = "booking_cancellation";

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

async function isPastNoRefundCutoff(db: Firestore, booking: Booking): Promise<boolean> {
  const experienceId = booking.experienceId;
  const slotId = booking.slotId;
  if (!experienceId || !slotId) return false;
  try {
    const expSnap = await db.collection("experiences").doc(experienceId).get();
    if (!expSnap.exists) return false;
    const exp = expSnap.data() as { cancellationPolicy?: { noRefundAfterHours?: number } };
    if (exp.cancellationPolicy?.noRefundAfterHours == null) return false;
    const parsedSlot = parseSlotId(slotId);
    if (!parsedSlot) return false;
    const { start: departureStart } = getSlotStartEnd(
      parsedSlot.dateStr,
      parsedSlot.startHour,
      parsedSlot.durationHours,
      parsedSlot.startMinute ?? 0
    );
    const cutoff = new Date(
      departureStart.getTime() - (exp.cancellationPolicy.noRefundAfterHours ?? 0) * 60 * 60 * 1000
    );
    return new Date() > cutoff;
  } catch {
    return false;
  }
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

    const slotRef = slotId
      ? boatId
          ? db.collection("boats").doc(boatId).collection("slots").doc(slotId)
          : experienceId
            ? db.collection("experiences").doc(experienceId).collection("slots").doc(slotId)
            : null
      : null;

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

    let slotReleased = false;
    let distinctIds: string[] = getDistinctStripePaymentIntentIds(booking);
    let shouldAdjustSummary = false;
    let concurrentCanceled = false;

    if (!isResume) {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(bookingRef);
        if (!snap.exists) return;
        const b = snap.data() as Booking;
        if (b.status === "canceled" || b.status === "refunded") {
          concurrentCanceled = true;
          return;
        }

        const revenueCents = totalSummaryAttributedRevenueCents(b);
        shouldAdjustSummary = shouldAdjustSummaryForCancel(b);

        const createdAt = (b as { createdAt?: { toDate?: () => Date } }).createdAt;
        const createdDate = createdAt?.toDate?.();
        const monthKey =
          createdDate
            ? `revenue_${createdDate.getFullYear()}_${String(createdDate.getMonth() + 1).padStart(2, "0")}`
            : null;

        distinctIds = getDistinctStripePaymentIntentIds(b);

        const cancellationRefund = !body.refund
          ? ({
              status: "skipped" as const,
              ...(shouldAdjustSummary ? { summaryAppliedAt: Timestamp.now() } : {}),
            })
          : ({
              status: "pending" as const,
              ...(shouldAdjustSummary ? { summaryAppliedAt: Timestamp.now() } : {}),
            });

        if (body.refund !== false && distinctIds.length > 0) {
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
        });

        if (shouldAdjustSummary) {
          const summaryRef = db.collection("summaries").doc("revenue");
          tx.set(summaryRef, {
            totalRevenueCents: FieldValue.increment(-revenueCents),
            bookingCount: FieldValue.increment(-1),
            customerCount: FieldValue.increment(-1),
          }, { merge: true });
          if (monthKey) {
            const monthRef = db.collection("summaries").doc(monthKey);
            tx.set(monthRef, {
              revenueCents: FieldValue.increment(-revenueCents),
              bookingCount: FieldValue.increment(-1),
            }, { merge: true });
          }
        }

        if (slotRef) {
          const slotSnap = await tx.get(slotRef);
          if (slotSnap.exists) {
            const slot = slotSnap.data() as { status?: string; bookingId?: string };
            if (slot.status === "booked") {
              const slotBookingId =
                typeof slot.bookingId === "string" && slot.bookingId.trim() ? slot.bookingId.trim() : "";
              if (slotBookingId && slotBookingId !== bookingId) {
                console.warn(
                  "[admin/cancel] data integrity: slot.bookingId does not match canceled booking — releasing slot using booking as source of truth",
                  { bookingId, slotBookingId, slotPath: slotRef.path }
                );
                void writeOperationalAlert({
                  type: "admin_cancel_slot_booking_id_mismatch",
                  source: "admin-cancel",
                  bookingId,
                  slotBookingId,
                  slotPath: slotRef.path,
                }).catch(() => {});
              }
              tx.update(slotRef, {
                status: "open",
                holdId: FieldValue.delete(),
                bookingId: FieldValue.delete(),
                updatedAt: FieldValue.serverTimestamp(),
              });
              slotReleased = true;
            }
          }
        } else if (slotId) {
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

        if (tripDateStr && b.experienceId && Number.isFinite(b.partySize)) {
          const expRef = db.collection("experiences").doc(b.experienceId);
          const expTxSnap = await tx.get(expRef);
          if (expTxSnap.exists) {
            const expTx = expTxSnap.data() as { pricingType?: string };
            if (expTx.pricingType === "ticketed") {
              const inventoryRef = getDepartureInventoryRef(db, b.experienceId, tripDateStr);
              tx.set(
                inventoryRef,
                {
                  reservedSeats: FieldValue.increment(b.partySize ?? 0),
                  updatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
              );
            }
          }
        }
      });
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
    }

    if (!isResume && concurrentCanceled) {
      return NextResponse.json({ ok: true, already: true, slotReleased: false });
    }

    // Best-effort slot cleanup for legacy bookings missing boatId/experienceId.
    if (!slotReleased && !slotRef && slotId && experienceId) {
      try {
        const expSlug =
          expSnapForName?.exists && typeof (expSnapForName.data() as { slug?: unknown })?.slug === "string"
            ? String((expSnapForName.data() as { slug: string }).slug).trim()
            : "";
        const variants = getExperienceIdVariants(experienceId, expSlug);
        const boatSnaps = await Promise.all(
          variants.map((v) =>
            db
              .collection("boats")
              .where("isListingBoat", "==", true)
              .where("active", "==", true)
              .where("experienceIds", "array-contains", v)
              .get()
          )
        );
        const boatIds = Array.from(
          new Set(boatSnaps.flatMap((s) => s.docs.map((d) => d.id)))
        );
        const candidateRefs = [
          db.collection("experiences").doc(experienceId).collection("slots").doc(slotId),
          ...boatIds.map((bid) => db.collection("boats").doc(bid).collection("slots").doc(slotId)),
        ];
        const snaps = await db.getAll(...candidateRefs);
        const batch = db.batch();
        let anyUpdated = false;
        for (const s of snaps) {
          if (!s.exists) continue;
          const d = s.data() as { status?: string };
          if (d?.status !== "booked") continue;
          batch.update(s.ref, {
            status: "open",
            holdId: FieldValue.delete(),
            bookingId: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          anyUpdated = true;
        }
        if (anyUpdated) {
          await batch.commit();
          slotReleased = true;
        }
      } catch (cleanupErr) {
        console.warn(
          "[admin/cancel] best-effort slot cleanup failed",
          cleanupErr instanceof Error ? cleanupErr.message : cleanupErr
        );
        void writeOperationalAlert({
          type: "admin_cancel_slot_cleanup_failed",
          source: "admin-cancel",
          bookingId,
          slotId,
          boatId: boatId ?? null,
          experienceId: experienceId ?? null,
          error:
            cleanupErr instanceof Error
              ? cleanupErr.message.slice(0, 500)
              : String(cleanupErr).slice(0, 500),
        }).catch(() => {});
      }
    }

    let refunds: Array<{ paymentIntentId: string; id?: string; status?: string; amount?: number; error?: string }> = [];
    const skippedRefunds: Array<{ paymentIntentId: string; reason: string }> = [];
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
          const refund = await stripe.refunds.create(
            { payment_intent: piId },
            { idempotencyKey: buildAdminCancelRefundIdempotencyKey(prId) }
          );
          refunds.push({
            paymentIntentId: piId,
            id: refund.id,
            status: refund.status ?? undefined,
            amount: refund.amount ?? undefined,
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
        await bookingRef.update({
          cancellationRefund: {
            status: "succeeded",
            summaryAppliedAt: Timestamp.now(),
          },
        });
      } else {
        const allSucceeded = distinctIds.every((piId) => {
          const r = refunds.find((x) => x.paymentIntentId === piId);
          return Boolean(r && !r.error && r.status === "succeeded");
        });
        if (allSucceeded) {
          await bookingRef.update({
            cancellationRefund: {
              status: "succeeded",
              summaryAppliedAt: Timestamp.now(),
            },
          });
        } else {
          const anySucceeded = refunds.some((r) => !r.error && r.status === "succeeded");
          const anyFailure = refunds.some((r) => r.error) || skippedRefunds.length > 0;
          let st: BookingCancellationRefundStatus = "pending";
          if (anySucceeded) st = "partial";
          else if (anyFailure) st = "failed";
          await bookingRef.update({ cancellationRefund: { status: st } });
        }
      }
    } else if (body.refund && !shouldAdjustSummary) {
      await bookingRef.update({ cancellationRefund: { status: "skipped" } });
    }

    const experienceName = expSnapForName?.exists ? (expSnapForName.data() as { title?: string })?.title ?? "Your trip" : "Your trip";

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
        const expSnap = await db.collection("experiences").doc(expId).get();
        if (expSnap.exists) {
          const exp = expSnap.data() as { cancellationPolicy?: { fullText?: string; noRefundAfterHours?: number } };
          if (exp.cancellationPolicy?.noRefundAfterHours != null) {
            const parsedSlot = slotId ? parseSlotId(slotId) : null;
            if (parsedSlot) {
              const { start: departureStart } = getSlotStartEnd(
                parsedSlot.dateStr,
                parsedSlot.startHour,
                parsedSlot.durationHours,
                parsedSlot.startMinute ?? 0
              );
              const cutoff = new Date(
                departureStart.getTime() - (exp.cancellationPolicy.noRefundAfterHours ?? 0) * 60 * 60 * 1000
              );
              if (new Date() > cutoff) {
                cancellationPolicyWarning = "No-refund window may have passed per experience cancellation policy. Review before confirming refund.";
              }
            }
          }
        }
      } catch {
        // non-fatal; omit warning
      }
    }

    return NextResponse.json({
      ok: true,
      slotReleased,
      refunds,
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
