/**
 * POST /api/admin/bookings/[id]/cancel
 * Cancel a booking (set status to "canceled") and release the slot so it becomes available again.
 * Optionally issues a Stripe refund when the booking has a payment intent. Requires admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { getStripe } from "@/lib/booking/stripe-client";
import { tryClaimSend, markClaimSent, markClaimFailed } from "@/lib/booking/notification-claim";
import type { Booking } from "@/lib/booking/types";
import { totalSummaryAttributedRevenueCents } from "@/lib/booking/summary-revenue";
import type { DocumentSnapshot } from "firebase-admin/firestore";

const CANCELLATION_TEMPLATE_KEY = "booking_cancellation";

function parseBody(body: unknown): { refund?: boolean } {
  if (body == null || typeof body !== "object") return { refund: true };
  const o = body as Record<string, unknown>;
  const refund = o.refund;
  if (refund === false) return { refund: false };
  return { refund: true };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id: bookingId } = await params;
  if (!bookingId) return NextResponse.json({ error: "Missing booking id" }, { status: 400 });

  let body: { refund?: boolean } = { refund: true };
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
    if (booking.status === "canceled" || booking.status === "refunded") {
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
    const revenueCents = totalSummaryAttributedRevenueCents(booking);
    const bookingExt = booking as Booking & { summaryCountersApplied?: boolean; holdId?: string };
    const shouldAdjustSummary =
      revenueCents > 0 &&
      (bookingExt.summaryCountersApplied === true || !!bookingExt.holdId);
    const createdAt = (booking as { createdAt?: { toDate?: () => Date } }).createdAt;
    const createdDate = createdAt?.toDate?.();
    const monthKey =
      createdDate
        ? `revenue_${createdDate.getFullYear()}_${String(createdDate.getMonth() + 1).padStart(2, "0")}`
        : null;

    let slotReleased = false;
    await db.runTransaction(async (tx) => {
      tx.update(bookingRef, { status: "canceled", updatedAt: FieldValue.serverTimestamp() });
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
          if (slot.status === "booked" && slot.bookingId === bookingId) {
            tx.update(slotRef, {
              status: "open",
              holdId: FieldValue.delete(),
              bookingId: FieldValue.delete(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            slotReleased = true;
          }
        }
      }
    });

    let refunds: Array<{ paymentIntentId: string; id?: string; status?: string; amount?: number; error?: string }> = [];
    const skippedRefunds: Array<{ paymentIntentId: string; reason: string }> = [];
    if (body.refund !== false && process.env.STRIPE_SECRET_KEY) {
      const intentIds = [
        booking.stripe?.paymentIntentId,
        booking.stripe?.depositPaymentIntentId,
        booking.stripe?.finalPaymentIntentId,
      ].filter((id): id is string => typeof id === "string" && id.length > 0);
      const distinctIds = Array.from(new Set(intentIds));
      const stripe = getStripe();
      for (const piId of distinctIds) {
        try {
          const pi = await stripe.paymentIntents.retrieve(piId);
          if (pi.status !== "succeeded") {
            skippedRefunds.push({
              paymentIntentId: piId,
              reason: `PaymentIntent status is '${pi.status}', not 'succeeded'; skipping refund`,
            });
            continue;
          }
          const refund = await stripe.refunds.create({ payment_intent: piId });
          refunds.push({
            paymentIntentId: piId,
            id: refund.id,
            status: refund.status ?? undefined,
            amount: refund.amount ?? undefined,
          });
        } catch (refundErr) {
          const msg = refundErr instanceof Error ? refundErr.message : String(refundErr);
          console.error("[admin/cancel] Stripe refund failed", { bookingId, piId }, refundErr);
          refunds.push({ paymentIntentId: piId, error: msg });
          try {
            await db.collection("pendingRefunds").add({
              bookingId,
              paymentIntentId: piId,
              reason: "admin_cancel_refund_failed",
              status: "pending",
              createdAt: Timestamp.now(),
              errorMessage: msg,
            });
          } catch (pendingErr) {
            console.error("[admin/cancel] Failed to write pendingRefunds", pendingErr);
          }
        }
      }
    }

    const experienceName = expSnapForName?.exists ? (expSnapForName.data() as { title?: string })?.title ?? "Your trip" : "Your trip";

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

    let cancellationPolicyWarning: string | undefined;
    const expId = booking.experienceId;
    if (expId) {
      try {
        const expSnap = await db.collection("experiences").doc(expId).get();
        if (expSnap.exists) {
          const exp = expSnap.data() as { cancellationPolicy?: { fullText?: string; noRefundAfterHours?: number } };
          if (exp.cancellationPolicy?.noRefundAfterHours != null) {
            const slotDateStr = booking.startDateStr ?? parseSlotId(slotId)?.dateStr;
            if (slotDateStr) {
              const slotStart = new Date(slotDateStr + "T00:00:00");
              const cutoff = new Date(slotStart.getTime() - (exp.cancellationPolicy.noRefundAfterHours ?? 0) * 60 * 60 * 1000);
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
