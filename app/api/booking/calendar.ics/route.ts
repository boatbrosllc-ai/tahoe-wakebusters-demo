/**
 * GET /api/booking/calendar.ics
 * iCal feed of confirmed bookings for an experience and date range.
 * Secured by a secret token in the URL (calendar apps need a static URL; no admin session).
 * Query: token (required), experienceId (required), from (YYYY-MM-DD), to (YYYY-MM-DD).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { parseSlotIdRelaxed, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import type { Booking } from "@/lib/booking/types";
import { timingSafeStringEqual } from "@/lib/booking/secure-compare";
import { checkRateLimitPublicRead, getClientKey } from "@/lib/booking/rate-limit";

const TZ = "America/Chicago";

/** Format a Date in America/Chicago for iCal TZID (YYYYMMDDTHHmmSS). */
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
  const token = request.nextUrl.searchParams.get("token");
  const experienceId = request.nextUrl.searchParams.get("experienceId");
  const fromParam = request.nextUrl.searchParams.get("from");
  const toParam = request.nextUrl.searchParams.get("to");

  const secret = process.env.BOOKING_CALENDAR_FEED_SECRET ?? process.env.CALENDAR_FEED_SECRET;
  const t = token ?? "";
  if (!secret || !timingSafeStringEqual(t, secret)) {
    return new NextResponse("Unauthorized", { status: 401 });
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
      if (!BOOKING_STATUSES_SLOT_TAKEN.has(data.status as never)) continue;
      bookings.push({ id: doc.id, data });
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
    "PRODID:-//Boat Bros//Booking Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    "TZID:America/Chicago",
    "X-LIC-LOCATION:America/Chicago",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0600",
    "TZOFFSETTO:-0500",
    "TZNAME:CDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0600",
    "TZNAME:CST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
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
    const summary = `${escapeIcalText(experienceName)} – ${escapeIcalText(b.customer?.name?.trim() || b.customer?.email || "Guest")}`;
    const dtStart = formatIcalLocal(start);
    const dtEnd = formatIcalLocal(end);
    const updated = (b as { updatedAt?: { toDate?: () => Date } }).updatedAt?.toDate?.();

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:booking-${id}@boatbros`);
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
      ...(lastModified && { "Last-Modified": lastModified.toUTCString() }),
    },
  });
}
