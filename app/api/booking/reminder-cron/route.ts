/**
 * Booking reminder cron: sends 1-week, 24h, and day-of (3h before) emails.
 * Run hourly (e.g. 0 * * * *). Trip times are interpreted in America/Chicago (Austin).
 * Waiver link included in each email when the guest hasn't signed yet.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { sendBookingReminderEmail } from "@/lib/booking/brevo";
import { parseSlotId, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { getRequestById } from "@/lib/waiver/firestore";
import type { Booking } from "@/lib/booking/types";
import type { Experience } from "@/lib/booking/types";

const CRON_SECRET = process.env.CRON_SECRET;

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

/** Within window for 1-week reminder (6.5–7.5 days from now). */
function in1WeekWindow(tripStartMs: number, nowMs: number): boolean {
  const diff = tripStartMs - nowMs;
  return diff >= 6.5 * ONE_DAY_MS && diff <= 7.5 * ONE_DAY_MS;
}

/** Within window for 24h reminder (23–25 hours from now). */
function in24hWindow(tripStartMs: number, nowMs: number): boolean {
  const diff = tripStartMs - nowMs;
  return diff >= 23 * ONE_HOUR_MS && diff <= 25 * ONE_HOUR_MS;
}

/** Within window for day-of reminder (2.5–3.5 hours from now). */
function inDayOfWindow(tripStartMs: number, nowMs: number): boolean {
  const diff = tripStartMs - nowMs;
  return diff >= 2.5 * ONE_HOUR_MS && diff <= 3.5 * ONE_HOUR_MS;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 503 });
  }

  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const now = new Date();
  const nowMs = now.getTime();

  const paidStatuses = ["paid", "deposit_paid", "final_paid", "final_due"];
  const snap = await db
    .collection("bookings")
    .where("status", "in", paidStatuses)
    .limit(200)
    .get();

  let sent1Week = 0;
  let sent24h = 0;
  let sentDayOf = 0;

  for (const doc of snap.docs) {
    const booking = doc.data() as Booking & {
      reminder1WeekSentAt?: unknown;
      reminder24hSentAt?: unknown;
      reminderDayOfSentAt?: unknown;
    };
    const slotId = booking.slotId;
    if (!slotId) continue;

    const parsed = parseSlotId(slotId);
    if (!parsed) continue;

    const tripStart = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours ?? 2, parsed.startMinute ?? 0).start;
    const tripStartMs = tripStart.getTime();
    const startTimeStr = tripStart.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Chicago",
    });
    const tripDateStr = tripStart.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "America/Chicago",
    });

    let experienceName = "Your trip";
    let locationText = "We'll send exact meeting point before your trip.";
    let locationAddress = "";
    let whatToBring: string[] = [];

    if (booking.experienceId) {
      const expSnap = await db.collection("experiences").doc(booking.experienceId).get();
      if (expSnap.exists) {
        const exp = expSnap.data() as Experience;
        experienceName = exp.title ?? experienceName;
        locationText = exp.location?.addressText ?? locationText;
        locationAddress = exp.location?.addressText ?? "";
        whatToBring = exp.whatToBring ?? [];
      }
    }

    const toEmail = booking.customer?.email?.trim();
    const customerName = booking.customer?.name?.trim() ?? "Guest";
    if (!toEmail) continue;

    let waiverSigningUrl: string | null = null;
    if (booking.waiver?.requestId && booking.waiver?.status === "pending") {
      const req = await getRequestById(booking.waiver.requestId);
      if (req?.status === "pending" && req.signingUrl) {
        waiverSigningUrl = req.signingUrl;
      }
    }

    const params = {
      to: toEmail,
      customerName,
      experienceName,
      tripDate: tripDateStr,
      startTime: startTimeStr,
      locationText,
      locationAddress: locationAddress || undefined,
      waiverSigningUrl,
      whatToBring,
    };

    try {
      if (!booking.reminder1WeekSentAt && in1WeekWindow(tripStartMs, nowMs)) {
        await sendBookingReminderEmail("1week", params);
        await doc.ref.update({
          reminder1WeekSentAt: Timestamp.now(),
        });
        sent1Week++;
      } else if (!booking.reminder24hSentAt && in24hWindow(tripStartMs, nowMs)) {
        await sendBookingReminderEmail("24h", params);
        await doc.ref.update({
          reminder24hSentAt: Timestamp.now(),
        });
        sent24h++;
      } else if (!booking.reminderDayOfSentAt && inDayOfWindow(tripStartMs, nowMs)) {
        await sendBookingReminderEmail("dayof", params);
        await doc.ref.update({
          reminderDayOfSentAt: Timestamp.now(),
        });
        sentDayOf++;
      }
    } catch (err) {
      console.error("[booking/reminder-cron] send failed", doc.id, err);
    }
  }

  return NextResponse.json({
    sent1Week,
    sent24h,
    sentDayOf,
    checked: snap.size,
  });
}
