/**
 * Cron: send "final payment request" email 48 hours before trip to bookings with status final_due.
 * Run hourly (e.g. 0 * * * *). Trip times in America/Chicago.
 * Email includes a secure link to /booking/manage?token=... where they can pay; Stripe webhook marks final_paid.
 * Requires MANAGE_BOOKING_SECRET and APP_BASE_URL for the pay link.
 *
 * Pagination: iterates all eligible records using cursor-based pages bounded by a
 * trip-date window (startDateStr). Uses the existing composite index
 * (status ASC + startDateStr DESC) and pages until exhaustion.
 * Emits structured metrics (matched, processed, skipped, failed) per run.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { sendFinalPaymentRequestEmail } from "@/lib/booking/brevo";
import { getFinalPaymentRequestSubject } from "@/lib/booking/reminder-emails";
import { logEmailSent } from "@/lib/booking/email-log";
import { sendFinalPaymentRequestSms } from "@/lib/booking/sms";
import { tryClaimSend, markClaimSent, markClaimFailed } from "@/lib/booking/notification-claim";
import { getDueRetries, addToRetryQueue, markRetrySent, markRetryFailed } from "@/lib/booking/reminder-retry";
import { formatMoney } from "@/lib/booking/format-money";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { signManageToken } from "@/lib/booking/manageToken";
import { bookingEnv } from "@/lib/booking/env";
import type { Booking } from "@/lib/booking/types";
import type { Experience } from "@/lib/booking/types";
import { timingSafeStringEqual } from "@/lib/booking/secure-compare";
import { notifyFinalChargeSuccess } from "@/lib/booking/notify-final-charge-success";

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

const PAGE_SIZE = 100;

/** Within window for 48h reminder (46–50 hours from now). */
function in48hWindow(tripStartMs: number, nowMs: number): boolean {
  const diff = tripStartMs - nowMs;
  return diff >= 46 * ONE_HOUR_MS && diff <= 50 * ONE_HOUR_MS;
}

/** Returns a YYYY-MM-DD date string from a Date (UTC calendar day). */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !timingSafeStringEqual(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!bookingEnv.manageBookingSecret) {
    return NextResponse.json(
      { error: "MANAGE_BOOKING_SECRET not set; cannot generate pay links" },
      { status: 503 },
    );
  }

  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const now = new Date();
  const nowMs = now.getTime();

  // Bound startDateStr to the 46–50 h window with a 1-day margin on each side.
  // Extend windowEndStr by 1 extra day (4 days out) so evening-departure bookings in CST
  // are not silently skipped due to UTC calendar date boundary; in48hWindow remains the precise guard.
  const windowStartStr = toDateStr(new Date(nowMs + 1 * ONE_DAY_MS));
  const windowEndStr = toDateStr(new Date(nowMs + 4 * ONE_DAY_MS));

  let matched = 0;
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  // Cache experience docs by ID — each experience is fetched at most once per cron run.
  const expCache = new Map<string, Experience | null>();
  async function getExperience(expId: string): Promise<Experience | null> {
    if (expCache.has(expId)) return expCache.get(expId)!;
    const snap = await db.collection("experiences").doc(expId).get();
    const data = snap.exists ? (snap.data() as Experience) : null;
    expCache.set(expId, data);
    return data;
  }

  // Phase 0a/0b: single fetch so retries are not starved when the queue is under pressure.
  const allDue = await getDueRetries(db, 50);
  const successRetries = allDue.filter((r) => r.templateKey === "final_charge_success");
  const requestRetries = allDue.filter((r) => r.templateKey === "final_payment_request");

  // Phase 0a: due retries for final_charge_success (final balance receipt email)
  for (const { bookingId, templateKey } of successRetries) {
    const bookingSnap = await db.collection("bookings").doc(bookingId).get();
    if (!bookingSnap.exists) continue;
    const booking = bookingSnap.data() as Booking;
    if (booking.status !== "final_paid") {
      skipped++;
      continue;
    }
    try {
      const ok = await notifyFinalChargeSuccess(db, bookingId, booking);
      if (ok) await markRetrySent(db, bookingId, templateKey);
      processed++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await markRetryFailed(db, bookingId, templateKey, errMsg);
      failed++;
    }
  }

  // Phase 0b: process due retries for final_payment_request
  for (const { bookingId, templateKey } of requestRetries) {
    const bookingSnap = await db.collection("bookings").doc(bookingId).get();
    if (!bookingSnap.exists) continue;
    const booking = bookingSnap.data() as Booking;
    if (booking.finalPaymentRequestSentAt) continue;
    const slotId = booking.slotId;
    if (!slotId) continue;
    const parsed = parseSlotId(slotId.trim());
    if (!parsed) continue;
    const tripStart = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours ?? 2, parsed.startMinute ?? 0).start;
    const tripDateStr = tripStart.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
    const startTimeStr = tripStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
    const toEmail = booking.customer?.email?.trim();
    const customerName = booking.customer?.name?.trim() ?? "Guest";
    if (!toEmail) continue;
    const finalCents = booking.stripe?.finalAmountCents ?? 0;
    if (finalCents <= 0) continue;
    let experienceName = "Your trip";
    if (booking.experienceId) {
      const exp = await getExperience(booking.experienceId);
      if (exp) experienceName = exp.title ?? experienceName;
    }
    const manageToken = signManageToken({ bookingId, customerEmail: toEmail, tripDateStr: booking.startDateStr });
    const payLink = manageToken ? `${bookingEnv.appBaseUrl}/booking/manage?token=${encodeURIComponent(manageToken)}` : "";
    const claimed = await tryClaimSend(db, bookingId, templateKey);
    if (!claimed) continue;
    try {
      await sendFinalPaymentRequestEmail({ to: toEmail, customerName, experienceName, tripDate: tripDateStr, startTime: startTimeStr, amountFormatted: formatMoney(finalCents), payLink });
      await logEmailSent({ to: toEmail, toName: customerName, templateId: "final_payment_request", subject: getFinalPaymentRequestSubject(), bookingId });
      const updateData: Record<string, unknown> = { finalPaymentRequestSentAt: Timestamp.now() };
      if (booking.customer?.phone?.trim()) {
        const smsSent = await sendFinalPaymentRequestSms({ phone: booking.customer.phone, customerName, experienceName, tripDate: tripDateStr, amountFormatted: formatMoney(finalCents), payLink, bookingId });
        if (smsSent) updateData.finalPaymentRequestSmsSentAt = Timestamp.now();
      }
      await bookingSnap.ref.update(updateData);
      await markClaimSent(db, bookingId, templateKey);
      await markRetrySent(db, bookingId, templateKey);
      processed++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await markClaimFailed(db, bookingId, templateKey, errMsg);
      await markRetryFailed(db, bookingId, templateKey, errMsg);
      failed++;
    }
  }

  let cursor: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | null = null;

  while (true) {
    const finalDueStatuses = ["final_due", "final_requires_action", "final_failed"];
    let q = db
      .collection("bookings")
      .where("status", "in", finalDueStatuses)
      .where("startDateStr", ">=", windowStartStr)
      .where("startDateStr", "<=", windowEndStr)
      .orderBy("startDateStr", "desc")
      .limit(PAGE_SIZE);

    if (cursor) q = q.startAfter(cursor);

    const snap = await q.get();
    if (snap.empty) break;

    matched += snap.size;

    for (const doc of snap.docs) {
      const booking = doc.data() as Booking & { finalPaymentRequestSentAt?: unknown };

      if (booking.finalPaymentRequestSentAt) {
        skipped++;
        continue;
      }

      const slotId = booking.slotId;
      if (!slotId) {
        skipped++;
        continue;
      }

      const parsed = parseSlotId(slotId.trim());
      if (!parsed) {
        skipped++;
        continue;
      }

      const tripStart = getSlotStartEnd(
        parsed.dateStr,
        parsed.startHour,
        parsed.durationHours ?? 2,
        parsed.startMinute ?? 0,
      ).start;
      const tripStartMs = tripStart.getTime();

      if (!in48hWindow(tripStartMs, nowMs)) {
        skipped++;
        continue;
      }

      const toEmail = booking.customer?.email?.trim();
      const customerName = booking.customer?.name?.trim() ?? "Guest";
      if (!toEmail) {
        skipped++;
        continue;
      }

      const finalCents = booking.stripe?.finalAmountCents ?? 0;
      if (finalCents <= 0) {
        skipped++;
        continue;
      }

      let experienceName = "Your trip";
      if (booking.experienceId) {
        const exp = await getExperience(booking.experienceId);
        if (exp) experienceName = exp.title ?? experienceName;
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

      const manageToken = signManageToken({ bookingId: doc.id, customerEmail: toEmail, tripDateStr: booking.startDateStr });
      const payLink = manageToken ? `${bookingEnv.appBaseUrl}/booking/manage?token=${encodeURIComponent(manageToken)}` : "";

      const templateKey = "final_payment_request";
      const claimed = await tryClaimSend(db, doc.id, templateKey);
      if (!claimed) {
        skipped++;
        continue;
      }
      try {
        const subject = getFinalPaymentRequestSubject();
        await sendFinalPaymentRequestEmail({
          to: toEmail,
          customerName,
          experienceName,
          tripDate: tripDateStr,
          startTime: startTimeStr,
          amountFormatted: formatMoney(finalCents),
          payLink,
        });
        await logEmailSent({ to: toEmail, toName: customerName, templateId: "final_payment_request", subject, bookingId: doc.id });
        const updateData: Record<string, unknown> = { finalPaymentRequestSentAt: Timestamp.now() };
        if (booking.customer?.phone?.trim()) {
          const smsSent = await sendFinalPaymentRequestSms({
            phone: booking.customer.phone,
            customerName,
            experienceName,
            tripDate: tripDateStr,
            amountFormatted: formatMoney(finalCents),
            payLink,
            bookingId: doc.id,
          });
          if (smsSent) updateData.finalPaymentRequestSmsSentAt = Timestamp.now();
        }
        await doc.ref.update(updateData);
        await markClaimSent(db, doc.id, templateKey);
        processed++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        await markClaimFailed(db, doc.id, templateKey, errMsg);
        await addToRetryQueue(db, doc.id, templateKey, errMsg);
        console.error("[admin/cron/final-payment-reminder-cron] send failed", doc.id, err);
        failed++;
      }
    }

    if (snap.size < PAGE_SIZE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  return NextResponse.json({ matched, processed, skipped, failed });
}
