/**
 * Booking reminder cron: sends 1-week, 24h, and day-of (3h before) emails.
 * Run hourly (e.g. 0 * * * *). Trip times are interpreted in America/Mazatlan (Cabo).
 * Waiver link included in each email when the guest hasn't signed yet.
 *
 * Pagination: iterates all eligible records using cursor-based pages bounded by a
 * trip-date window (startDateStr). Each status is paged independently using the
 * existing composite index (status ASC + startDateStr DESC) until exhaustion.
 * Emits structured metrics (matched, processed, skipped, failed) per run.
 */

import { NextRequest, NextResponse } from "next/server";
import { BUSINESS_TIMEZONE } from "@/lib/booking/business-timezone";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { sendBookingReminderEmail } from "@/lib/booking/brevo";
import { getReminderSubject } from "@/lib/booking/reminder-emails";
import { logEmailSent } from "@/lib/booking/email-log";
import { sendBookingReminderSms } from "@/lib/booking/sms";
import { tryClaimSend, markClaimSent, markClaimFailed } from "@/lib/booking/notification-claim";
import {
  getDueRetries,
  addToRetryQueue,
  markRetrySent,
  markRetryFailed,
  markRetrySkipped,
  type ReminderTemplateKey,
} from "@/lib/booking/reminder-retry";
import { parseSlotId, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { emailFieldsFromExperience } from "@/lib/booking/experience-email-logistics";
import {
  getRequestById,
  buildWaiverSigningUrlFromTokenId,
  getActiveGroupSigningUrlForBooking,
} from "@/lib/waiver/firestore";
import type { Booking } from "@/lib/booking/types";
import type { Experience } from "@/lib/booking/types";
import { assertCronPostAuthorized } from "@/lib/booking/cron-auth";
import {
  REMINDER_PAID_STATUSES,
  in1WeekWindow,
  in24hWindow,
  inDayOfWindow,
  isBookingEligibleForReminderRetry,
} from "@/lib/booking/reminder-eligibility";
import { notifyStaffReminderSent } from "@/lib/booking/staff-notifications";

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

const PAGE_SIZE = 100;

/** Returns a YYYY-MM-DD date string from a Date (UTC calendar day). */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  const authErr = await assertCronPostAuthorized(request);
  if (authErr) return authErr;

  const db = getDb();
  const { Timestamp } = getFirestoreExports();
  const now = new Date();
  const nowMs = now.getTime();

  // Bound the startDateStr range: 1 day back (edge-case safety) to 8 days forward
  // (covers the widest reminder window of 7.5 days). String comparison works because
  // startDateStr is YYYY-MM-DD and the existing index is status + startDateStr DESC.
  const windowStartStr = toDateStr(new Date(nowMs - ONE_DAY_MS));
  const windowEndStr = toDateStr(new Date(nowMs + 8 * ONE_DAY_MS));

  const paidStatuses = [...REMINDER_PAID_STATUSES];

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

  // Phase 0: process due retries first (regardless of original window)
  const reminderTemplateKeys: ReminderTemplateKey[] = ["reminder_1week", "reminder_24h", "reminder_dayof"];
  const dueRetries = await getDueRetries(db, 30);
  for (const { bookingId, templateKey } of dueRetries.filter((r) => reminderTemplateKeys.includes(r.templateKey))) {
    const bookingSnap = await db.collection("bookings").doc(bookingId).get();
    if (!bookingSnap.exists) continue;
    const booking = bookingSnap.data() as Booking & {
      reminder1WeekSentAt?: unknown;
      reminder24hSentAt?: unknown;
      reminderDayOfSentAt?: unknown;
    };

    if (
      !isBookingEligibleForReminderRetry(
        booking,
        templateKey as "reminder_1week" | "reminder_24h" | "reminder_dayof",
        nowMs
      )
    ) {
      await markRetrySkipped(db, bookingId, templateKey, "retry_eligibility_lost");
      skipped++;
      continue;
    }

    const slotId = booking.slotId;
    if (!slotId) continue;
    const parsed = parseSlotId(slotId);
    if (!parsed) continue;
    const tripStart = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours ?? 2, parsed.startMinute ?? 0).start;
    const startTimeStr = tripStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: BUSINESS_TIMEZONE });
    const tripDateStr = tripStart.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: BUSINESS_TIMEZONE });
    let experienceName = "Your trip";
    let locationText = "We'll send exact meeting point before your trip.";
    let locationAddress = "";
    let whatToBring: string[] = [];
    let logistics: ReturnType<typeof emailFieldsFromExperience>["logistics"] | undefined;
    if (booking.experienceId) {
      const exp = await getExperience(booking.experienceId);
      if (exp) {
        experienceName = exp.title ?? experienceName;
        const fields = emailFieldsFromExperience(exp, locationText);
        locationText = fields.locationText;
        locationAddress = fields.logistics.pickupAddress ?? "";
        whatToBring = fields.logistics.whatToBring;
        logistics = fields.logistics;
      }
    }
    const toEmail = booking.customer?.email?.trim();
    const customerName = booking.customer?.name?.trim() ?? "Guest";
    if (!toEmail) continue;
    let waiverSigningUrl: string | null = null;
    let waiverGroupSigningUrl: string | null = null;
    if (booking.waiver?.requestId) {
      const req = await getRequestById(booking.waiver.requestId);
      if (req?.status === "pending") {
        if (req.signingTokenId) waiverSigningUrl = buildWaiverSigningUrlFromTokenId(req.signingTokenId);
        else if (req.signingUrl) waiverSigningUrl = req.signingUrl;
        if ((booking.partySize ?? 1) > 1) {
          waiverGroupSigningUrl =
            req.groupSigningUrl ?? (await getActiveGroupSigningUrlForBooking(bookingId)) ?? null;
        }
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
      waiverGroupSigningUrl,
      whatToBring,
      logistics,
    };
    const claimed = await tryClaimSend(db, bookingId, templateKey);
    if (!claimed) continue;
    try {
      const type = templateKey === "reminder_1week" ? "1week" : templateKey === "reminder_24h" ? "24h" : "dayof";
      const { providerMessageId } = await sendBookingReminderEmail(type, params, {
        idempotencyKey: `${bookingId}_${templateKey}`,
      });
      await markClaimSent(db, bookingId, templateKey, { providerMessageId });
      await markRetrySent(db, bookingId, templateKey, { providerMessageId });

      void logEmailSent({
        to: toEmail,
        toName: customerName,
        templateId: `booking_${templateKey}` as "booking_reminder_1week" | "booking_reminder_24h" | "booking_reminder_dayof",
        subject: getReminderSubject(type, params.experienceName),
        bookingId,
      }).catch((e) => console.error("[reminder-cron] logEmailSent", e));

      const updateData: Record<string, unknown> =
        templateKey === "reminder_1week" ? { reminder1WeekSentAt: Timestamp.now() } : templateKey === "reminder_24h" ? { reminder24hSentAt: Timestamp.now() } : { reminderDayOfSentAt: Timestamp.now() };
      if (booking.customer?.phone?.trim()) {
        const smsSent = await sendBookingReminderSms({ phone: booking.customer.phone, customerName, experienceName, tripDate: tripDateStr, reminderType: type, bookingId, waiverSigningUrl: waiverSigningUrl ?? undefined });
        if (smsSent) (updateData as Record<string, unknown>)[templateKey === "reminder_1week" ? "reminder1WeekSmsSentAt" : templateKey === "reminder_24h" ? "reminder24hSmsSentAt" : "reminderDayOfSmsSentAt"] = Timestamp.now();
      }
      await bookingSnap.ref.update(updateData).catch((e) => console.error("[reminder-cron] booking timestamp update", e));

      void notifyStaffReminderSent({
        bookingId,
        kind: type,
        experienceName,
        tripDate: tripDateStr,
        customerName,
        customerEmail: booking.customer?.email?.trim(),
      });

      processed++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await markClaimFailed(db, bookingId, templateKey, errMsg);
      await markRetryFailed(db, bookingId, templateKey, errMsg);
      failed++;
    }
  }

  for (const status of paidStatuses) {
    let cursor: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | null = null;

    while (true) {
      let q = db
        .collection("bookings")
        .where("status", "==", status)
        .where("startDateStr", ">=", windowStartStr)
        .where("startDateStr", "<=", windowEndStr)
        .orderBy("startDateStr", "desc")
        .limit(PAGE_SIZE);

      if (cursor) q = q.startAfter(cursor);

      const snap = await q.get();
      if (snap.empty) break;

      matched += snap.size;

      for (const doc of snap.docs) {
        const booking = doc.data() as Booking & {
          reminder1WeekSentAt?: unknown;
          reminder24hSentAt?: unknown;
          reminderDayOfSentAt?: unknown;
        };

        const slotId = booking.slotId;
        if (!slotId) {
          skipped++;
          continue;
        }

        const parsed = parseSlotId(slotId);
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

        // Quick pre-check: skip expensive lookups when no window applies.
        const needsReminder =
          (!booking.reminder1WeekSentAt && in1WeekWindow(tripStartMs, nowMs)) ||
          (!booking.reminder24hSentAt && in24hWindow(tripStartMs, nowMs)) ||
          (!booking.reminderDayOfSentAt && inDayOfWindow(tripStartMs, nowMs));

        if (!needsReminder) {
          skipped++;
          continue;
        }

        const startTimeStr = tripStart.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: BUSINESS_TIMEZONE,
        });
        const tripDateStr = tripStart.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: BUSINESS_TIMEZONE,
        });

        let experienceName = "Your trip";
        let locationText = "We'll send exact meeting point before your trip.";
        let locationAddress = "";
        let whatToBring: string[] = [];
        let logistics: ReturnType<typeof emailFieldsFromExperience>["logistics"] | undefined;

        if (booking.experienceId) {
          const exp = await getExperience(booking.experienceId);
          if (exp) {
            experienceName = exp.title ?? experienceName;
            const fields = emailFieldsFromExperience(exp, locationText);
            locationText = fields.locationText;
            locationAddress = fields.logistics.pickupAddress ?? "";
            whatToBring = fields.logistics.whatToBring;
            logistics = fields.logistics;
          }
        }

        const toEmail = booking.customer?.email?.trim();
        const customerName = booking.customer?.name?.trim() ?? "Guest";
        if (!toEmail) {
          skipped++;
          continue;
        }

        let waiverSigningUrl: string | null = null;
        let waiverGroupSigningUrl: string | null = null;
        if (booking.waiver?.requestId) {
          const req = await getRequestById(booking.waiver.requestId);
          if (req?.status === "pending") {
            if (req.signingTokenId) waiverSigningUrl = buildWaiverSigningUrlFromTokenId(req.signingTokenId);
            else if (req.signingUrl) waiverSigningUrl = req.signingUrl;
            if ((booking.partySize ?? 1) > 1) {
              waiverGroupSigningUrl =
                req.groupSigningUrl ?? (await getActiveGroupSigningUrlForBooking(doc.id)) ?? null;
            }
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
          waiverGroupSigningUrl,
          whatToBring,
          logistics,
        };

        const templateKey =
          !booking.reminder1WeekSentAt && in1WeekWindow(tripStartMs, nowMs)
            ? "reminder_1week"
            : !booking.reminder24hSentAt && in24hWindow(tripStartMs, nowMs)
              ? "reminder_24h"
              : !booking.reminderDayOfSentAt && inDayOfWindow(tripStartMs, nowMs)
                ? "reminder_dayof"
                : null;
        if (!templateKey) {
          skipped++;
          continue;
        }
        const claimed = await tryClaimSend(db, doc.id, templateKey);
        if (!claimed) {
          skipped++;
          continue;
        }
        try {
          const type = templateKey === "reminder_1week" ? "1week" : templateKey === "reminder_24h" ? "24h" : "dayof";
          const subject = getReminderSubject(type, params.experienceName);
          const { providerMessageId } = await sendBookingReminderEmail(type, params, {
            idempotencyKey: `${doc.id}_${templateKey}`,
          });
          await markClaimSent(db, doc.id, templateKey, { providerMessageId });

          void logEmailSent({ to: toEmail, toName: customerName, templateId: `booking_${templateKey}` as "booking_reminder_1week" | "booking_reminder_24h" | "booking_reminder_dayof", subject, bookingId: doc.id }).catch((e) =>
            console.error("[reminder-cron] logEmailSent", e)
          );

          const updateData: Record<string, unknown> =
            templateKey === "reminder_1week"
              ? { reminder1WeekSentAt: Timestamp.now() }
              : templateKey === "reminder_24h"
                ? { reminder24hSentAt: Timestamp.now() }
                : { reminderDayOfSentAt: Timestamp.now() };
          if (booking.customer?.phone?.trim()) {
            const smsSent = await sendBookingReminderSms({
              phone: booking.customer.phone,
              customerName,
              experienceName,
              tripDate: tripDateStr,
              reminderType: type,
              bookingId: doc.id,
              waiverSigningUrl: waiverSigningUrl ?? undefined,
            });
            if (smsSent) {
              (updateData as Record<string, unknown>)[templateKey === "reminder_1week" ? "reminder1WeekSmsSentAt" : templateKey === "reminder_24h" ? "reminder24hSmsSentAt" : "reminderDayOfSmsSentAt"] = Timestamp.now();
            }
          }
          await doc.ref.update(updateData).catch((e) => console.error("[reminder-cron] booking timestamp update", e));

          void notifyStaffReminderSent({
            bookingId: doc.id,
            kind: type,
            experienceName,
            tripDate: tripDateStr,
            customerName,
            customerEmail: booking.customer?.email?.trim(),
          });

          processed++;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await markClaimFailed(db, doc.id, templateKey, errMsg);
          await addToRetryQueue(db, doc.id, templateKey as ReminderTemplateKey, errMsg);
          console.error("[admin/cron/reminder-cron] send failed", doc.id, err);
          failed++;
        }
      }

      if (snap.size < PAGE_SIZE) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
  }

  return NextResponse.json({ matched, processed, skipped, failed });
}
