import { combineEmailBodies, labeledValue } from "../html-to-text";
import { durationHoursBetween, parseMarketplaceDateTime, parseSplitDateAndTime } from "../dates";
import { extractMarketplaceEmailDetails, extractMarketplaceEmailExcerpt } from "../email-details";
import { extractMarketplaceGuestEmail } from "../guest-contact";
import { extractMarketplaceAmountCents, extractMarketplaceGuestPaidCents } from "../money";
import type { ExternalBookingEvent, GmailMessageInput, ParseResult } from "../types";

const INBOX_ID_RE = /getmyboat\.com\/(?:[\w-]+\/)*inbox\/(\d{4,})/i;
const INBOX_PATH_RE = /\/inbox\/(\d{4,})\//i;
const ENCODED_INBOX_RE = /inbox%2f(\d{4,})/i;

export function extractGetmyboatBookingId(text: string, html?: string): string | undefined {
  const haystack = `${html ?? ""}\n${text}`;
  const decoded = haystack.replace(/%2f/gi, "/");
  return (
    decoded.match(INBOX_ID_RE)?.[1] ??
    decoded.match(INBOX_PATH_RE)?.[1] ??
    haystack.match(ENCODED_INBOX_RE)?.[1]
  );
}

function classifyGetmyboat(subject: string, body: string): ExternalBookingEvent["eventType"] {
  const hay = `${subject}\n${body}`;
  if (/\b(inquiry|reminder|left a review|new message|security deposit)\b/i.test(subject)) {
    return "informational";
  }
  if (/\b(canceled|cancelled)\b/i.test(subject) || /\bbooking (?:has been |was )?(canceled|cancelled)\b/i.test(body)) {
    return "booking_cancelled";
  }
  if (/\b(updated|changed|rescheduled|modified|amendment)\b/i.test(subject) && /\bbooking\b/i.test(hay)) {
    return "booking_updated";
  }
  if (
    /booking confirmed/i.test(hay) ||
    /just confirmed payment/i.test(body) ||
    /\bpayment (?:is |was )?confirmed\b/i.test(hay) ||
    /\breservation confirmed\b/i.test(hay) ||
    /\byou(?:'re| are) booked\b/i.test(hay)
  ) {
    return "booking_created";
  }
  return "informational";
}

function isJunkListingLine(line: string): boolean {
  const l = line.trim();
  if (!l) return true;
  if (/^https?:\/\//i.test(l) || /click\.getmyboat/i.test(l) || /itunes\.apple/i.test(l)) return true;
  return false;
}

function looksLikeListingName(line: string): boolean {
  if (isJunkListingLine(line) || line.length <= 12) return false;
  return /wake\s*surf|pontoon|w\/\s*captain|with captain|– \d+\s*guests|lake austin/i.test(line);
}

function extractCustomerName(subject: string | undefined, body: string): string | undefined {
  const fromSubject = subject?.match(/Getmyboat Booking with ([^(]+)/i)?.[1]?.trim();
  if (fromSubject && !/^guest(?:\s+name)?$/i.test(fromSubject)) return fromSubject.replace(/\s+/g, " ");
  const fromPayment = body.match(/([A-Z][A-Za-z' -]{1,60}?)\s+just confirmed payment/i)?.[1]?.trim();
  if (fromPayment) return fromPayment.replace(/\s+/g, " ");
  const afterPayment = body.match(/just confirmed payment[\s\S]{0,80}\n+([A-Z][A-Za-z' -]{2,60})/)?.[1]?.trim();
  if (afterPayment && !/^(get|ios|android|booking|axis|depart|you earned)/i.test(afterPayment)) {
    return afterPayment.replace(/\s+/g, " ");
  }
  return undefined;
}

function extractListingName(body: string): string | undefined {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const idx = lines.findIndex((l) => /just confirmed payment/i.test(l));
  const window = idx >= 0 ? lines.slice(idx + 1, idx + 12) : lines;
  const raw = window.find((l) => looksLikeListingName(l)) ?? lines.find((l) => looksLikeListingName(l));
  if (!raw) return undefined;
  return raw
    .replace(/^listing:\s*/i, "")
    .replace(/^[“"']|[”"']$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseGetmyboatMessage(input: GmailMessageInput): ParseResult {
  const body = combineEmailBodies(input.text, input.html);
  const haystack = `${input.subject ?? ""}\n${body}\n${input.html ?? ""}`;
  const externalBookingId = extractGetmyboatBookingId(haystack, input.html);
  const eventType = classifyGetmyboat(input.subject ?? "", haystack);
  if (!externalBookingId) {
    if (eventType === "informational") {
      return { ok: false, status: "ignored", provider: "getmyboat", error: "informational_without_booking_id" };
    }
    return { ok: false, status: "parse_failed", provider: "getmyboat", error: "missing_booking_id" };
  }

  const departTime = labeledValue(body, "Depart");
  const returnTime = labeledValue(body, "Return");
  const dateFromDepart = body.match(/\bDepart\b[\s\S]{0,80}?((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,\s+[A-Za-z]+\s+\d{1,2},\s+\d{4})/i)?.[1];
  const dateFromReturn = body.match(/\bReturn\b[\s\S]{0,80}?((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,\s+[A-Za-z]+\s+\d{1,2},\s+\d{4})/i)?.[1];
  const paymentDate = body.match(/confirmed payment for\s+[A-Za-z]+?\s+([A-Za-z]+\s+\d{1,2}\s+\d{4})/i)?.[1];
  const startAt =
    (departTime ? parseMarketplaceDateTime(departTime) : null) ??
    (departTime && (dateFromDepart || paymentDate)
      ? parseSplitDateAndTime(dateFromDepart || paymentDate || "", departTime)
      : null) ??
    undefined;
  const endAt =
    (returnTime ? parseMarketplaceDateTime(returnTime) : null) ??
    (returnTime && (dateFromReturn || dateFromDepart || paymentDate)
      ? parseSplitDateAndTime(dateFromReturn || dateFromDepart || paymentDate || "", returnTime)
      : null) ??
    undefined;
  const durationLabel = body.match(/\bDuration\b[:\s]*([0-9]+(?:\.[0-9]+)?)\s*hours?/i)?.[1];
  const guests = body.match(/\bGroup Size\b[:\s]*(\d+)\s*Guests?/i)?.[1];
  const customerName = extractCustomerName(input.subject, body);
  const arrivalMatch = body.match(/Street Address For Arrival\s*([\s\S]{0,200}?)(?:\n\s*\n|With Captain|$)/i);
  const location = arrivalMatch
    ? arrivalMatch[1]
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join(", ")
    : labeledValue(body, "Street Address For Arrival");

  const ice = haystack.match(/\bIce\s+\$?([\d,]+\.\d{2})/i)?.[1];
  const details = extractMarketplaceEmailDetails(haystack);
  const guestPaid = extractMarketplaceGuestPaidCents(haystack);
  if (guestPaid) details["Renter Payments"] = details["Renter Payments"] ?? `USD $${(guestPaid / 100).toFixed(2)}`;
  if (ice) details.Ice = details.Ice ?? `$${ice}`;

  const event: ExternalBookingEvent = {
    provider: "getmyboat",
    eventType,
    externalBookingId,
    externalListingName: extractListingName(body),
    customerName,
    customerEmail: extractMarketplaceGuestEmail(haystack, input.html),
    startAt,
    endAt,
    passengerCount: guests ? Number(guests) : undefined,
    location,
    captainStatus: /\bwith captain\b/i.test(body) ? "Captained" : undefined,
    addonSummary: ice ? `Ice $${ice}` : undefined,
    durationHours:
      (startAt && endAt ? durationHoursBetween(startAt, endAt) : null) ??
      (durationLabel ? Math.round(Number(durationLabel)) : undefined),
    totalCents: extractMarketplaceAmountCents(haystack, ["Your Payout", "Payout"]) ?? undefined,
    details,
    emailExcerpt: extractMarketplaceEmailExcerpt(haystack),
    sourceMessageId: input.id,
    sourceThreadId: input.threadId,
    sourceSubject: input.subject,
    parseNotes: eventType === "booking_cancelled" || eventType === "booking_updated"
      ? ["cancellation_or_update_template_unverified"]
      : undefined,
  };
  return { ok: true, event };
}
