/**
 * Cron: send "final payment request" email 48 hours before trip to bookings with status final_due.
 * Run hourly (e.g. 0 * * * *). Trip times in America/Chicago.
 * Email includes a secure link to /booking/manage?token=... where they can pay; Stripe webhook marks final_paid.
 * Requires MANAGE_BOOKING_SECRET and APP_BASE_URL for the pay link.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { sendFinalPaymentRequestEmail } from "@/lib/booking/brevo";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { signManageToken } from "@/lib/booking/manageToken";
import { bookingEnv } from "@/lib/booking/env";
import type { Booking } from "@/lib/booking/types";
import type { Experience } from "@/lib/booking/types";

const CRON_SECRET = process.env.CRON_SECRET;
const ONE_HOUR_MS = 60 * 60 * 1000;

/** Trip start as Date in America/Chicago (Austin). */
function getTripStartCentral(dateStr: string, startHour: number, startMinute = 0): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const month = m - 1;
  const iso = `${dateStr}T${String(startHour).padStart(2, "0")}:${String(startMinute).padStart(2, "0")}:00`;
  return new Date(iso);
}

/** Within window for 48h reminder (46–50 hours from now). */
function in48hWindow(tripStartMs: number, nowMs: number): boolean {
  const diff = tripStartMs - nowMs;
  return diff >= 46 * ONE_HOUR_MS && diff <= 50 * ONE_HOUR_MS;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!bookingEnv.manageBookingSecret) {
    return NextResponse.json(
      { error: "MANAGE_BOOKING_SECRET not set; cannot generate pay links" },
      { status: 503 }
    );
  }

  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const now = new Date();
  const nowMs = now.getTime();

  const snap = await db
    .collection("bookings")
    .where("status", "==", "final_due")
    .limit(200)
    .get();

  let sent = 0;

  for (const doc of snap.docs) {
    const booking = doc.data() as Booking & { finalPaymentRequestSentAt?: unknown };
    if (booking.finalPaymentRequestSentAt) continue;

    const slotId = booking.slotId;
    if (!slotId) continue;

    const parsed = parseSlotId(slotId.trim());
    if (!parsed) continue;

    const tripStart = getTripStartCentral(parsed.dateStr, parsed.startHour, parsed.startMinute ?? 0);
    const tripStartMs = tripStart.getTime();
    if (!in48hWindow(tripStartMs, nowMs)) continue;

    const toEmail = booking.customer?.email?.trim();
    const customerName = booking.customer?.name?.trim() ?? "Guest";
    if (!toEmail) continue;

    const finalCents = booking.stripe?.finalAmountCents ?? 0;
    if (finalCents <= 0) continue;

    let experienceName = "Your trip";
    if (booking.experienceId) {
      const expSnap = await db.collection("experiences").doc(booking.experienceId).get();
      if (expSnap.exists) {
        const exp = expSnap.data() as Experience;
        experienceName = exp.title ?? experienceName;
      }
    }

    const tripDateStr = tripStart.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "America/Chicago",
    });
    const startTimeStr = tripStart.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Chicago",
    });

    const payLink = `${bookingEnv.appBaseUrl}/booking/manage?token=${encodeURIComponent(signManageToken({ bookingId: doc.id }))}`;

    try {
      await sendFinalPaymentRequestEmail({
        to: toEmail,
        customerName,
        experienceName,
        tripDate: tripDateStr,
        startTime: startTimeStr,
        amountFormatted: `$${(finalCents / 100).toFixed(2)}`,
        payLink,
      });
      await doc.ref.update({
        finalPaymentRequestSentAt: Timestamp.now(),
      });
      sent++;
    } catch (err) {
      console.error("[final-payment-reminder-cron] send failed", doc.id, err);
    }
  }

  return NextResponse.json({
    sent,
    checked: snap.size,
  });
}
