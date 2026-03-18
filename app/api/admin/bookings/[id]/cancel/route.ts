/**
 * POST /api/admin/bookings/[id]/cancel
 * Cancel a booking (set status to "canceled") and release the slot so it becomes available again.
 * Optionally issues a Stripe refund when the booking has a payment intent. Requires admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getDepartureInventoryRef, releaseCapacity } from "@/lib/booking/shared-departure-inventory";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { getStripe } from "@/lib/booking/stripe-client";
import type { Booking } from "@/lib/booking/types";

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

  try {
    const db = getDb();
    const { FieldValue } = getFirestoreExports();
    const bookingRef = db.collection("bookings").doc(bookingId);
    const bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    const booking = bookingSnap.data() as Booking;
    if (booking.status === "canceled" || booking.status === "refunded") {
      return NextResponse.json({ ok: true, already: true });
    }

    const experienceId = booking.experienceId;
    const boatId = booking.boatId;
    const slotId = booking.slotId;
    if (!slotId) {
      await bookingRef.update({ status: "canceled", updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ ok: true, slotReleased: false, refund: null });
    }

    // Listing-boat flow: slot lives under boats/{boatId}/slots. Else: experiences/{experienceId}/slots.
    const slotRef = boatId
      ? db.collection("boats").doc(boatId).collection("slots").doc(slotId)
      : experienceId
        ? db.collection("experiences").doc(experienceId).collection("slots").doc(slotId)
        : null;
    if (!slotRef) {
      await bookingRef.update({ status: "canceled", updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ ok: true, slotReleased: false, refund: null });
    }
    const slotSnap = await slotRef.get();
    if (!slotSnap.exists) {
      await bookingRef.update({ status: "canceled", updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ ok: true, slotReleased: false, refund: null });
    }
    const slot = slotSnap.data() as { status?: string; bookingId?: string };
    if (slot.status !== "booked" || slot.bookingId !== bookingId) {
      await bookingRef.update({ status: "canceled", updatedAt: FieldValue.serverTimestamp() });
      return NextResponse.json({ ok: true, slotReleased: false, refund: null });
    }

    await db.runTransaction(async (tx) => {
      tx.update(bookingRef, { status: "canceled", updatedAt: FieldValue.serverTimestamp() });
      tx.update(slotRef, {
        status: "open",
        holdId: FieldValue.delete(),
        bookingId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      // Ticketed/shared: release capacity in departure inventory so the slot can be rebooked.
      const isShared = booking.bookingMode === "shared";
      const expId = booking.experienceId;
      const dateStr = booking.startDateStr ?? parseSlotId(slotId)?.dateStr;
      if (isShared && expId && dateStr && (booking.partySize ?? 0) > 0) {
        const inventoryRef = getDepartureInventoryRef(db, expId, dateStr);
        await releaseCapacity(tx, inventoryRef, booking.partySize ?? 0);
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
        }
      }
    }

    try {
      const { sendBookingCancellationEmail } = await import("@/lib/booking/brevo");
      const { formatMoney } = await import("@/lib/booking/format-money");
      const expSnapForName = experienceId ? await db.collection("experiences").doc(experienceId).get() : null;
      const experienceName = expSnapForName?.exists ? (expSnapForName.data() as { title?: string })?.title ?? "Your trip" : "Your trip";
      const tripDateStr = booking.startDateStr ?? parseSlotId(slotId)?.dateStr;
      // Compute refund amount from actual Stripe refund objects; only include confirmed successful refunds.
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
    } catch (emailErr) {
      console.error("[admin/cancel] Cancellation email failed", bookingId, emailErr);
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
      slotReleased: true,
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
