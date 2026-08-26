import { combineEmailBodies, labeledValue } from "../html-to-text";
import { durationHoursBetween, parseMarketplaceDateTime } from "../dates";
import { extractMarketplaceEmailDetails, extractMarketplaceEmailExcerpt } from "../email-details";
import { extractMarketplaceGuestEmail } from "../guest-contact";
import { extractMarketplaceAmountCents } from "../money";
import type { ExternalBookingEvent, GmailMessageInput, ParseResult } from "../types";

const BOOKING_ID_RE = /\bBooking ID\b[:\s]*([a-z0-9]{5,12})\b/i;
const CANCELED_BOOKING_RE =
  /\b(?:has\s+)?(?:canceled|cancelled)\s+their\s+booking\s+([a-z0-9]{5,12})\b/i;
const SUBJECT_BOOKING_RE = /\bbooking\s+([a-z0-9]{6,8})\b/i;
const INSTANT_BOOKING_RE = /You (?:have|received) an? Instant Booking/i;
const CONFIRMED_BOOKING_RE =
  /You (?:have|received) an? (?:Instant )?Booking|\bnew (?:Instant )?Booking\b|\bbooking (?:is |was )?(?:confirmed|approved)\b|\b(?:listing|boat) (?:was |has been )?booked\b|\ba renter (?:has )?booked\b|\bthis trip is automatically approved\b|\bGet ready to earn\b/i;
const PREPARE_SUBJECT_RE = /^Prepare your boat for/i;
const MODIFICATION_RE =
  /\b(updated|changed|rescheduled|modification|your booking (?:has been|was) (?:updated|changed|modified))\b/i;
const REJECTED_BOOKING_IDS = new Set([
  "mercury",
  "verado",
  "yamaha",
  "honda",
  "suzuki",
  "trailer",
  "pontoon",
  "booking",
  "instant",
  "axis",
  "details",
  "canceled",
  "cancelled",
]);

function isPlausibleBoatsetterId(id?: string): id is string {
  if (!id) return false;
  const key = id.toLowerCase();
  if (REJECTED_BOOKING_IDS.has(key)) return false;
  return /^[a-z0-9]{6,8}$/.test(key);
}

function extractBookingId(text: string, subject?: string): string | undefined {
  const labeled = text.match(BOOKING_ID_RE)?.[1]?.toLowerCase();
  if (isPlausibleBoatsetterId(labeled)) return labeled;
  const canceled = text.match(CANCELED_BOOKING_RE)?.[1]?.toLowerCase();
  if (isPlausibleBoatsetterId(canceled)) return canceled;
  const fromSubject = (subject ?? "").match(SUBJECT_BOOKING_RE)?.[1]?.toLowerCase();
  if (isPlausibleBoatsetterId(fromSubject)) return fromSubject;
  return undefined;
}

function sectionAfter(text: string, label: string): string | undefined {
  return labeledValue(text, label);
}

function isJunkListingLine(line: string): boolean {
  const l = line.trim();
  if (!l) return true;
  if (/^https?:\/\//i.test(l) || /^<https?:\/\//i.test(l)) return true;
  if (/get ready to earn/i.test(l)) return true;
  if (/instant book means/i.test(l)) return true;
  if (/^booking id\b/i.test(l)) return true;
  if (/instant booking/i.test(l)) return true;
  if (/you received/i.test(l)) return true;
  if (/has canceled/i.test(l) || /has cancelled/i.test(l)) return true;
  if (/prepare your boat/i.test(l)) return true;
  if (/^approved\.?$/i.test(l)) return true;
  if (/^learn more\b/i.test(l)) return true;
  return false;
}

function extractListingName(text: string): string | undefined {
  const beforeRenter = text.match(/\n\s*([A-Za-z0-9][A-Za-z0-9 /&.'-]{6,80})\s*\n+\s*Renter:/);
  if (beforeRenter && !isJunkListingLine(beforeRenter[1])) {
    return beforeRenter[1].replace(/\s+/g, " ").trim();
  }

  const afterDetails = text.match(
    /(?:Canceled booking details:|You (?:have|received) an? (?:Instant )?Booking[^\n]*\n)([\s\S]{0,800}?)(?:\n\s*Renter:)/i
  );
  if (afterDetails) {
    const lines = afterDetails[1]
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !isJunkListingLine(l));
    const caps = lines.find((l) => /^[A-Z0-9][A-Z0-9 /&.'-]{6,}$/.test(l));
    if (caps) return caps.replace(/\s+/g, " ");
    const named = lines.find((l) =>
      /\b(axis|wake|pontoon|tritoon|neptoon|mercury|bentley|suntracker)\b/i.test(l)
    );
    if (named) return named.replace(/\s+/g, " ");
    const candidate = lines.find((l) => /[A-Za-z]/.test(l) && l.length > 8);
    if (candidate) return candidate.replace(/\s+/g, " ");
  }
  return undefined;
}

function hasTripDetails(text: string, subject?: string): boolean {
  if (!extractBookingId(text, subject)) return false;
  return /\bStart\b/i.test(text) && /\bEnd\b/i.test(text);
}

function classifyBoatsetter(subject: string, body: string): ExternalBookingEvent["eventType"] {
  if (
    PREPARE_SUBJECT_RE.test(subject) ||
    /\bprepare your boat for\b/i.test(body) ||
    /\breminder\b/i.test(subject) ||
    /\bsecurity deposit\b/i.test(subject) ||
    /\bsecurity deposit payment\b/i.test(body)
  ) {
    return "informational";
  }
  if (
    /\bcanceled their booking\b/i.test(body) ||
    /\bcancelled their booking\b/i.test(body) ||
    /\bcanceled booking details\b/i.test(body) ||
    /\bcancelled booking details\b/i.test(body) ||
    /\bhas canceled\b/i.test(subject) ||
    /\bhas been canceled\b/i.test(subject) ||
    /\bhas been cancelled\b/i.test(subject)
  ) {
    return "booking_cancelled";
  }
  if (INSTANT_BOOKING_RE.test(subject) || INSTANT_BOOKING_RE.test(body) || CONFIRMED_BOOKING_RE.test(`${subject}\n${body}`)) {
    return "booking_created";
  }
  if (MODIFICATION_RE.test(subject) || MODIFICATION_RE.test(body)) {
    return "booking_updated";
  }
  if (hasTripDetails(body, subject)) {
    return "booking_created";
  }
  return "informational";
}

export function parseBoatsetterMessage(input: GmailMessageInput): ParseResult {
  const body = combineEmailBodies(input.text, input.html);
  const haystack = `${input.subject ?? ""}\n${body}`;
  const eventType = classifyBoatsetter(input.subject ?? "", haystack);
  const externalBookingId = extractBookingId(haystack, input.subject);
  if (!externalBookingId) {
    if (eventType === "informational") {
      return { ok: false, status: "ignored", provider: "boatsetter", error: "informational_without_booking_id" };
    }
    return { ok: false, status: "parse_failed", provider: "boatsetter", error: "missing_booking_id" };
  }
  const startRaw = sectionAfter(haystack, "Start") ?? haystack.match(/Instant Booking for ([^\n.]+)/i)?.[1];
  const endRaw = sectionAfter(haystack, "End");
  const startAt = startRaw ? parseMarketplaceDateTime(startRaw) ?? undefined : undefined;
  const endAt = endRaw ? parseMarketplaceDateTime(endRaw) ?? undefined : undefined;
  const durationFromRange = startAt && endAt ? durationHoursBetween(startAt, endAt) : null;
  const durationLabel = haystack.match(/\bDuration\b[:\s]*([0-9]+(?:\.[0-9]+)?)\s*hours?/i)?.[1];
  const durationHours = durationFromRange ?? (durationLabel ? Math.round(Number(durationLabel)) : undefined);
  const passengers = haystack.match(/\bPassengers\b[:\s]*(\d+)/i)?.[1];
  const renter = sectionAfter(haystack, "Renter");
  const location = sectionAfter(haystack, "Location");
  const captain = sectionAfter(haystack, "Captain");
  const addons = sectionAfter(haystack, "Add-ons") ?? sectionAfter(haystack, "Add ons");

  const event: ExternalBookingEvent = {
    provider: "boatsetter",
    eventType,
    externalBookingId,
    externalListingName: extractListingName(haystack),
    customerName: renter,
    customerEmail: extractMarketplaceGuestEmail(haystack, input.html),
    startAt,
    endAt,
    passengerCount: passengers ? Number(passengers) : undefined,
    location,
    captainStatus: captain,
    addonSummary: addons,
    durationHours: durationHours && durationHours > 0 ? durationHours : undefined,
    totalCents: extractMarketplaceAmountCents(haystack) ?? undefined,
    details: extractMarketplaceEmailDetails(haystack),
    emailExcerpt: extractMarketplaceEmailExcerpt(haystack),
    sourceMessageId: input.id,
    sourceThreadId: input.threadId,
    sourceSubject: input.subject,
  };
  return { ok: true, event };
}
