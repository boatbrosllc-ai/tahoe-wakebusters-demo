/**
 * GET /api/booking/calendar.ics
 * iCal feed of confirmed bookings for an experience and date range.
 * Secured by a secret token in the URL (calendar apps need a static URL; no admin session).
 * Query: token (required), experienceId (required), from (YYYY-MM-DD), to (YYYY-MM-DD).
 */

import { NextRequest, NextResponse } from "next/server";
import { BUSINESS_TIMEZONE } from "@/lib/booking/business-timezone";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { parseSlotIdRelaxed, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import type { Booking } from "@/lib/booking/types";
import { getLegacyBookingScanLimit } from "@/lib/booking/legacy-booking-scan-limit";
import { timingSafeStringEqual } from "@/lib/booking/secure-compare";
import {
  checkRateLimit,
  checkRateLimitPublicRead,
  getCalendarFeedTokenRateLimitKey,
  getClientKey,
} from "@/lib/booking/rate-limit";
import { verifyReceiptToken } from "@/lib/booking/receiptToken";

const TZ = BUSINESS_TIMEZONE;

/** Mazatlan is fixed UTC−7 (no DST). Chicago-style DAYLIGHT/STANDARD pairs must not be used. */
const VTIMEZONE_LINES: string[] = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZ}`,
  `X-LIC-LOCATION:${TZ}`,
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0700",
  "TZOFFSETTO:-0700",
  "TZNAME:MST",
  "DTSTART:19700101T000000",
  "END:STANDARD",
  "END:VTIMEZONE",
];

function bookingIncludedInOperatorIcalFeed(status: string | undefined): boolean {
  if (!status) return false;
  if (BOOKING_STATUSES_SLOT_TAKEN.has(status as never)) return true;
  return status === "final_failed" || status === "final_requires_action";
}

function icalSummaryForBooking(experienceName: string, b: Booking): string {
  const paymentIssue = b.status === "final_failed" || b.status === "final_requires_action";
  const namePart = escapeIcalText(b.customer?.name?.trim() || "Guest");
  if (paymentIssue) {
    return `${escapeIcalText(experienceName)} – [PAYMENT ISSUE] ${namePart}`;
  }
  return `${escapeIcalText(experienceName)} – ${namePart}`;
}

/** Format a Date in BUSINESS_TIMEZONE for iCal TZID (YYYYMMDDTHHmmSS). */
function formatIcalLocal(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const second = parts.find((p) => p.type === "second")?.value ?? "00";
  return `${y}${m}${day}T${hour}${minute}${second}`;
}

function formatIcalUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${day}T${h}${min}${s}Z`;
}

function escapeIcalText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

export async function GET(request: NextRequest) {
  const bookingIdParam = request.nextUrl.searchParams.get("bookingId");
  const receiptTokenParam = request.nextUrl.searchParams.get("receipt_token");

  if (bookingIdParam && receiptTokenParam) {
    const payload = verifyReceiptToken(receiptTokenParam);
    if (!payload || payload.bookingId !== bookingIdParam) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    const db = getDb();
    const doc = await db.collection("bookings").doc(bookingIdParam).get();
    if (!doc.exists) {
      return new NextResponse("Not found", { status: 404 });
    }
    const b = doc.data() as Booking;
    if (!bookingIncludedInOperatorIcalFeed(b.status)) {
      return new NextResponse("Not found", { status: 404 });
    }
    const expId = b.experienceId ?? "";
    let experienceName = "Nasty Sport Fishing trip";
    if (expId) {
      const expSnap = await db.collection("experiences").doc(expId).get();
      experienceName = expSnap.exists ? (expSnap.data() as { title?: string })?.title ?? experienceName : experienceName;
    }
    const parsed = parseSlotIdRelaxed(b.slotId ?? "");
    const dateStr = b.startDateStr ?? parsed?.dateStr ?? "";
    if (!dateStr || !parsed) {
      return new NextResponse("Invalid booking slot", { status: 400 });
    }
    let start: Date;
    let end: Date;
    try {
      const se = getSlotStartEnd(dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
      start = se.start;
      end = se.end;
    } catch {
      return new NextResponse("Invalid slot times", { status: 400 });
    }
    const summary = icalSummaryForBooking(experienceName, b);
    const dtStart = formatIcalLocal(start);
    const dtEnd = formatIcalLocal(end);
    const updated = (b as { updatedAt?: { toDate?: () => Date } }).updatedAt?.toDate?.();
    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Nasty Sport Fishing//Booking Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      ...VTIMEZONE_LINES,
      "BEGIN:VEVENT",
      `UID:booking-${bookingIdParam}@nastysportfishing`,
      `DTSTAMP:${formatIcalUtc(new Date())}`,
      `DTSTART;TZID=${TZ}:${dtStart}`,
      `DTEND;TZID=${TZ}:${dtEnd}`,
      `SUMMARY:${summary}`,
    ];
    if (updated) lines.push(`LAST-MODIFIED:${formatIcalUtc(updated)}`);
    lines.push("END:VEVENT", "END:VCALENDAR");
    const body = lines.join("\r\n");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="booking-${bookingIdParam}.ics"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const token = request.nextUrl.searchParams.get("token");
  const experienceId = request.nextUrl.searchParams.get("experienceId");
  const fromParam = request.nextUrl.searchParams.get("from");
  const toParam = request.nextUrl.searchParams.get("to");

  const secret = process.env.BOOKING_CALENDAR_FEED_SECRET ?? process.env.CALENDAR_FEED_SECRET;
  const t = token ?? "";
  if (!secret || !timingSafeStringEqual(t, secret)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const tokenPrefix = t.length > 0 ? t.slice(0, 32) : "empty";
  const rlToken = await checkRateLimit(getCalendarFeedTokenRateLimitKey(tokenPrefix));
  if (!rlToken.allowed) {
    const retryAfter = rlToken.retryAfterMs ? Math.ceil(rlToken.retryAfterMs / 1000) : 60;
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }
  const rl = await checkRateLimitPublicRead(getClientKey(request));
  if (!rl.allowed) {
    const retryAfter = rl.retryAfterMs ? Math.ceil(rl.retryAfterMs / 1000) : 60;
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }
  if (!experienceId || !fromParam || !toParam) {
    return new NextResponse("Missing experienceId, from, or to", { status: 400 });
  }
  const fromStr = fromParam.slice(0, 10);
  const toStr = toParam.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
    return new NextResponse("Invalid from/to (use YYYY-MM-DD)", { status: 400 });
  }

  const db = getDb();
  const expSnap = await db.collection("experiences").doc(experienceId).get();
  const experienceName = expSnap.exists ? (expSnap.data() as { title?: string })?.title ?? "Booking" : "Booking";
  const experienceSlug = expSnap.exists && typeof (expSnap.data() as { slug?: string })?.slug === "string"
    ? (expSnap.data() as { slug: string }).slug.trim()
    : "";
  const variantIds = getExperienceIdVariants(experienceId, experienceSlug);

  const snaps = await Promise.all(
    variantIds.map((id) =>
      db
        .collection("bookings")
        .where("experienceId", "==", id)
        .where("startDateStr", ">=", fromStr)
        .where("startDateStr", "<=", toStr)
        .get()
    )
  );
  const seen = new Set<string>();
  const bookings: { id: string; data: Booking }[] = [];
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      const data = doc.data() as Booking;
      if (!bookingIncludedInOperatorIcalFeed(data.status)) continue;
      bookings.push({ id: doc.id, data });
    }
  }
  let legacyTruncated = false;
  const legacyFallbackEnabled = process.env.DISABLE_LEGACY_BOOKING_FALLBACK !== "true";
  if (legacyFallbackEnabled && variantIds.length > 0) {
    // Remove this fallback after startDateStr backfill is complete and DISABLE_LEGACY_BOOKING_FALLBACK=true fleet-wide.
    const { Timestamp } = getFirestoreExports();
    const startThreshold = new Date(new Date(fromStr + "T12:00:00.000Z").getTime() - 14 * 24 * 60 * 60 * 1000);
    const legacyScanLimit = getLegacyBookingScanLimit();
    const legacySnaps = await Promise.all(
      variantIds.map((id) =>
        db
          .collection("bookings")
          .where("experienceId", "==", id)
          .where("createdAt", ">=", Timestamp.fromDate(startThreshold))
          .orderBy("createdAt", "desc")
          .limit(legacyScanLimit)
          .get()
      )
    );
    for (const snap of legacySnaps) {
      if (snap.size >= legacyScanLimit) legacyTruncated = true;
      for (const doc of snap.docs) {
        if (seen.has(doc.id)) continue;
        const data = doc.data() as Booking;
        if (data.startDateStr) continue;
        if (!bookingIncludedInOperatorIcalFeed(data.status)) continue;
        const parsed = parseSlotIdRelaxed(data.slotId ?? "");
        const dateStr = parsed?.dateStr ?? null;
        if (!dateStr || dateStr < fromStr || dateStr > toStr) continue;
        seen.add(doc.id);
        bookings.push({ id: doc.id, data });
      }
    }
  }

  const lastModified = bookings.length > 0
    ? bookings.reduce((latest, b) => {
        const u = (b.data as { updatedAt?: { toDate?: () => Date } }).updatedAt?.toDate?.();
        return u && (!latest || u > latest) ? u : latest;
      }, null as Date | null)
    : null;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nasty Sport Fishing//Booking Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...VTIMEZONE_LINES,
  ];

  for (const { id, data: b } of bookings) {
    const parsed = parseSlotIdRelaxed(b.slotId ?? "");
    const dateStr = b.startDateStr ?? parsed?.dateStr ?? "";
    if (!dateStr || !parsed) continue;
    let start: Date;
    let end: Date;
    try {
      const se = getSlotStartEnd(dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
      start = se.start;
      end = se.end;
    } catch {
      continue;
    }
    const summary = icalSummaryForBooking(experienceName, b);
    const dtStart = formatIcalLocal(start);
    const dtEnd = formatIcalLocal(end);
    const updated = (b as { updatedAt?: { toDate?: () => Date } }).updatedAt?.toDate?.();

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:booking-${id}@nastysportfishing`);
    lines.push(`DTSTAMP:${formatIcalUtc(new Date())}`);
    lines.push(`DTSTART;TZID=${TZ}:${dtStart}`);
    lines.push(`DTEND;TZID=${TZ}:${dtEnd}`);
    lines.push(`SUMMARY:${summary}`);
    if (updated) lines.push(`LAST-MODIFIED:${formatIcalUtc(updated)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  const body = lines.join("\r\n");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=600",
      ...(legacyTruncated ? { "X-Calendar-Partial-Data": "true" } : {}),
      ...(lastModified && { "Last-Modified": lastModified.toUTCString() }),
    },
  });
}
