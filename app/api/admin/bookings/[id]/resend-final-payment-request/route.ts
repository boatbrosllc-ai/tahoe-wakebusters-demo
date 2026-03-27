/**
 * POST /api/admin/bookings/[id]/resend-final-payment-request
 * Resend the "final payment request" email (48h pay link) to the customer. Requires admin session.
 * Booking must be final_due, final_requires_action, or final_failed with stripe.finalAmountCents > 0.
 */

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { sendFinalPaymentRequestEmail } from "@/lib/booking/brevo";
import { getFinalPaymentRequestSubject } from "@/lib/booking/reminder-emails";
import { logEmailSent } from "@/lib/booking/email-log";
import { formatMoney } from "@/lib/booking/format-money";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { getHoursUntilTrip } from "@/lib/booking/reminder-eligibility";
import { signManageToken } from "@/lib/booking/manageToken";
import { bookingEnv } from "@/lib/booking/env";
import type { Booking } from "@/lib/booking/types";
import type { Experience } from "@/lib/booking/types";
import {
  tryClaimAdminOverrideSend,
  markClaimSent,
  markClaimFailed,
  FINAL_PAYMENT_REQUEST_ADMIN_OVERRIDE_CLAIM_KEY,
} from "@/lib/booking/notification-claim";

const ALLOWED_STATUSES = ["final_due", "final_requires_action", "final_failed"] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id: bookingId } = await params;
  if (!bookingId) return NextResponse.json({ error: "Missing booking id" }, { status: 400 });

  if (!bookingEnv.manageBookingSecret) {
    return NextResponse.json(
      { error: "MANAGE_BOOKING_SECRET not set; cannot generate pay links" },
      { status: 503 }
    );
  }

  try {
    const db = getDb();
    const { Timestamp } = getFirestoreExports();
    const bookingSnap = await db.collection("bookings").doc(bookingId).get();
    if (!bookingSnap.exists) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    const booking = bookingSnap.data() as Booking;
    const status = booking.status;
    if (!ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
      return NextResponse.json(
        { error: `Booking status must be one of ${ALLOWED_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    const finalCents = booking.stripe?.finalAmountCents ?? 0;
    if (finalCents <= 0) {
      return NextResponse.json(
        { error: "Booking has no remaining balance to collect" },
        { status: 400 }
      );
    }

    const toEmail = booking.customer?.email?.trim();
    const customerName = booking.customer?.name?.trim() ?? "Guest";
    if (!toEmail) {
      return NextResponse.json({ error: "Booking has no customer email" }, { status: 400 });
    }

    let experienceName = "Your trip";
    if (booking.experienceId) {
      const expSnap = await db.collection("experiences").doc(booking.experienceId).get();
      if (expSnap.exists) {
        experienceName = (expSnap.data() as Experience).title ?? experienceName;
      }
    }

    const parsed = parseSlotId(booking.slotId ?? "");
    if (!parsed) {
      return NextResponse.json(
        {
          error: "Invalid or missing slot ID. Repair the booking slot data before resending the final payment request.",
          code: "INVALID_SLOT_ID",
        },
        { status: 400 }
      );
    }
    const { start } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours ?? 2, parsed.startMinute ?? 0);
    const hoursUntilTrip = getHoursUntilTrip(start.getTime(), Date.now());
    const tripDateStr = start.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "America/Chicago",
    });
    const startTimeStr = start.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Chicago",
    });

    const manageToken = signManageToken({ bookingId, tripDateStr: booking.startDateStr });
    const payLink = manageToken ? `${bookingEnv.appBaseUrl}/booking/manage?token=${encodeURIComponent(manageToken)}` : "";

    const claimed = await tryClaimAdminOverrideSend(db, bookingId, FINAL_PAYMENT_REQUEST_ADMIN_OVERRIDE_CLAIM_KEY);
    if (!claimed) {
      return NextResponse.json(
        { error: "Another admin resend is in progress; try again in a few minutes" },
        { status: 409 }
      );
    }

    const adminResendIdempotencyKey = `${bookingId}_final_payment_request_admin_${randomUUID()}`;
    try {
      const { providerMessageId } = await sendFinalPaymentRequestEmail(
        {
          to: toEmail,
          customerName,
          experienceName,
          tripDate: tripDateStr,
          startTime: startTimeStr,
          amountFormatted: formatMoney(finalCents),
          payLink,
          hoursUntilTrip,
        },
        { idempotencyKey: adminResendIdempotencyKey }
      );
      await markClaimSent(db, bookingId, FINAL_PAYMENT_REQUEST_ADMIN_OVERRIDE_CLAIM_KEY, { providerMessageId });
      await logEmailSent({
        to: toEmail,
        toName: customerName,
        templateId: "final_payment_request",
        subject: getFinalPaymentRequestSubject(),
        bookingId,
      }).catch((err) => console.error("[resend-final-payment-request] logEmailSent failed", err));

      await bookingSnap.ref.update({
        finalPaymentRequestSentAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      return NextResponse.json({ ok: true, message: "Final payment request email sent" });
    } catch (sendErr) {
      const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      await markClaimFailed(db, bookingId, FINAL_PAYMENT_REQUEST_ADMIN_OVERRIDE_CLAIM_KEY, errMsg);
      throw sendErr;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
