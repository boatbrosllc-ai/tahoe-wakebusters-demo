/**
 * Cron: attempt off-session final charge for bookings with finalChargeAt <= now.
 * Call with Authorization: Bearer CRON_SECRET.
 * Uses finalChargeLockAt to prevent double charging; webhook payment_intent.succeeded marks final_paid.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { sendFinalChargeFailedEmail } from "@/lib/booking/brevo";
import { signManageToken } from "@/lib/booking/manageToken";
import { bookingEnv } from "@/lib/booking/env";
import type { Booking } from "@/lib/booking/types";

const LOCK_SKIP_MS = 10 * 60 * 1000; // 10 min
const BATCH_SIZE = 40;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const db = getDb();
    const { Timestamp } = getFirestoreExports();
    const now = new Date();
    const nowTs = Timestamp.fromDate(now);

    const snap = await db
      .collection("bookings")
      .where("status", "==", "final_due")
      .where("finalChargeAt", "<=", nowTs)
      .limit(BATCH_SIZE)
      .get();

    let attempted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const doc of snap.docs) {
      const booking = doc.data() as Booking;
      const bookingId = doc.id;
      const lockAt = booking.stripe?.finalChargeLockAt;
      if (lockAt) {
        const lockDate = typeof lockAt.toDate === "function" ? lockAt.toDate() : new Date((lockAt as { seconds: number }).seconds * 1000);
        if (now.getTime() - lockDate.getTime() < LOCK_SKIP_MS) {
          skipped++;
          continue;
        }
      }
      const customerId = booking.stripe?.customerId;
      const paymentMethodId = booking.stripe?.paymentMethodId;
      const finalCents = booking.stripe?.finalAmountCents;
      if (!customerId || !paymentMethodId || finalCents == null || finalCents <= 0) {
        console.warn("[run-final-charges] booking missing customerId/pm/finalAmountCents", { bookingId });
        errors.push(`${bookingId}: missing stripe data`);
        continue;
      }

      const stripe = getStripe();
      try {
        await db.collection("bookings").doc(bookingId).update({
          status: "final_processing",
          "stripe.finalChargeLockAt": nowTs,
          "stripe.finalChargeAttemptedAt": nowTs,
        });
      } catch (updateErr) {
        console.warn("[run-final-charges] lock update failed", { bookingId }, updateErr);
        skipped++;
        continue;
      }

      try {
        const pi = await stripe.paymentIntents.create({
          amount: finalCents,
          currency: "usd",
          customer: customerId,
          payment_method: paymentMethodId,
          off_session: true,
          confirm: true,
          metadata: { bookingId, payment_stage: "final" },
        });
        console.log("[run-final-charges] PaymentIntent created (webhook will set final_paid)", { bookingId, piId: pi.id });
        attempted++;
      } catch (stripeErr: unknown) {
        const err = stripeErr as { code?: string; type?: string; message?: string };
        const code = err.code ?? err.type;
        const requiresAction =
          code === "authentication_required" ||
          code === "card_authentication_required" ||
          (typeof err.message === "string" && err.message.toLowerCase().includes("authenticate"));
        const newStatus = requiresAction ? "final_requires_action" : "final_failed";
        await db.collection("bookings").doc(bookingId).update({
          status: newStatus,
          "stripe.finalError": { code, message: err.message ?? undefined },
        });
        console.log("[run-final-charges] final charge failed, status updated", { bookingId, newStatus, code });
        attempted++;
        errors.push(`${bookingId}: ${code ?? err.message}`);
        try {
          let manageLink: string | undefined;
          if (bookingEnv.manageBookingSecret) {
            manageLink = `${bookingEnv.appBaseUrl}/booking/manage?token=${encodeURIComponent(signManageToken({ bookingId }))}`;
          }
          await sendFinalChargeFailedEmail(booking.customer.email, booking.customer.name, manageLink, requiresAction);
        } catch (emailErr) {
          console.error("[run-final-charges] sendFinalChargeFailedEmail failed", bookingId, emailErr);
        }
      }
    }

    return NextResponse.json({ ok: true, processed: snap.size, attempted, skipped, errors });
  } catch (err) {
    console.error("[run-final-charges]", err);
    return NextResponse.json({ error: "Final charge run failed" }, { status: 500 });
  }
}
