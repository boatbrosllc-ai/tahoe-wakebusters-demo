/**
 * Booking reminder cron: sends 1-week, 24h, and day-of (3h before) emails.
 * Run hourly (e.g. 0 * * * *). Trip times are interpreted in America/Chicago (Austin).
 * Waiver link included in each email when the guest hasn't signed yet.
 *
 * Pagination: iterates all eligible records using cursor-based pages bounded by a
 * trip-date window (startDateStr). Each status is paged independently using the
 * existing composite index (status ASC + startDateStr DESC) until exhaustion.
 * Emits structured metrics (matched, processed, skipped, failed) per run.
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

const PAGE_SIZE = 100;

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

/** Returns a YYYY-MM-DD date string from a Date (UTC calendar day). */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
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

  // Bound the startDateStr range: 1 day back (edge-case safety) to 8 days forward
  // (covers the widest reminder window of 7.5 days). String comparison works because
  // startDateStr is YYYY-MM-DD and the existing index is status + startDateStr DESC.
  const windowStartStr = toDateStr(new Date(nowMs - ONE_DAY_MS));
  const windowEndStr = toDateStr(new Date(nowMs + 8 * ONE_DAY_MS));

  const paidStatuses = ["paid", "deposit_paid", "final_paid", "final_due"] as const;

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
          const exp = await getExperience(booking.experienceId);
          if (exp) {
            experienceName = exp.title ?? experienceName;
            locationText = exp.location?.addressText ?? locationText;
            locationAddress = exp.location?.addressText ?? "";
            whatToBring = exp.whatToBring ?? [];
          }
        }

        const toEmail = booking.customer?.email?.trim();
        const customerName = booking.customer?.name?.trim() ?? "Guest";
        if (!toEmail) {
          skipped++;
          continue;
        }

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
            await doc.ref.update({ reminder1WeekSentAt: Timestamp.now() });
            processed++;
          } else if (!booking.reminder24hSentAt && in24hWindow(tripStartMs, nowMs)) {
            await sendBookingReminderEmail("24h", params);
            await doc.ref.update({ reminder24hSentAt: Timestamp.now() });
            processed++;
          } else if (!booking.reminderDayOfSentAt && inDayOfWindow(tripStartMs, nowMs)) {
            await sendBookingReminderEmail("dayof", params);
            await doc.ref.update({ reminderDayOfSentAt: Timestamp.now() });
            processed++;
          } else {
            skipped++;
          }
        } catch (err) {
          console.error("[booking/reminder-cron] send failed", doc.id, err);
          failed++;
        }
      }

      if (snap.size < PAGE_SIZE) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
  }

  return NextResponse.json({ matched, processed, skipped, failed });
}
