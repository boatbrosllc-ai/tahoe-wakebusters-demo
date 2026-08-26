import { combineEmailBodies, labeledValue } from "../html-to-text";
import { chicagoDateTime, parseCalendarDate, parseClockTime } from "../dates";
import { extractMarketplaceEmailDetails, extractMarketplaceEmailExcerpt, extractMarketplacePhone } from "../email-details";
import { extractMarketplaceGuestEmail } from "../guest-contact";
import { extractMarketplaceAmountCents } from "../money";
import type { ExternalBookingEvent, GmailMessageInput, ParseResult } from "../types";

function extractTourGradeTime(tourGrade?: string, tourGradeCode?: string): { hour: number; minute: number } | null {
  const code = tourGradeCode?.match(/~(\d{1,2}:\d{2}|\d{4})\b/)?.[1];
  if (code) return parseClockTime(code.includes(":") ? code : `${code.slice(0, 2)}:${code.slice(2)}`);
  const fromGrade = (tourGrade ?? "").match(/\b(\d{1,2}:\d{2})\b/)?.[1];
  if (fromGrade) return parseClockTime(fromGrade);
  return null;
}

function classifyViator(subject: string, body: string): ExternalBookingEvent["eventType"] {
  const hay = `${subject}\n${body}`;
  if (/\b(reminder|upcoming|don't forget|do not forget)\b/i.test(subject)) {
    return "informational";
  }
  if (/\b(canceled|cancelled)\b/i.test(subject) || /\b(canceled|cancelled) (?:your )?reservation\b/i.test(body)) {
    return "booking_cancelled";
  }
  if (
    /\b(amended|updated|changed|modified)\b/i.test(subject) ||
    /\b(?:amended booking|booking amended|booking has been amended|has been amended|here are the changes)\b/i.test(hay)
  ) {
    return "booking_updated";
  }
  if (
    /new booking/i.test(subject) ||
    /booking confirmation/i.test(body) ||
    /you have a new reservation/i.test(body) ||
    /\breservation confirmed\b/i.test(hay) ||
    /\bconfirmed booking\b/i.test(hay)
  ) {
    return "booking_created";
  }
  return "informational";
}

function travelerCount(raw?: string): number | undefined {
  if (!raw) return undefined;
  const adults = raw.match(/(\d+)\s*Adults?/i)?.[1];
  const kids = raw.match(/(\d+)\s*(?:Child|Children)/i)?.[1];
  const n = (adults ? Number(adults) : 0) + (kids ? Number(kids) : 0);
  return n > 0 ? n : undefined;
}

function extractViatorTourName(body: string): string | undefined {
  const labeled = labeledValue(body, "Tour Name");
  if (labeled && !/^(amended|confirmed|canceled|cancelled)$/i.test(labeled)) return labeled;
  const reservation = body.match(/reservation for ([^\n.]+)/i)?.[1]?.trim();
  if (reservation) return reservation.replace(/\s+/g, " ");
  const bookingFor = body.match(
    /booking for ([^\n]+?) on [A-Za-z]{3,9},?\s+[A-Za-z]+\s+\d{1,2}/i
  )?.[1]?.trim();
  if (bookingFor) return bookingFor.replace(/\s+/g, " ");
  const afterAmended = body.match(/\bAmended\b\s*\n+\s*([^\n]+)\s*\n+\s*Location:/i)?.[1]?.trim();
  if (afterAmended && afterAmended.length > 3) return afterAmended.replace(/\s+/g, " ");
  return undefined;
}

function extractViatorLeadName(body: string): string | undefined {
  return (
    labeledValue(body, "Lead Traveler Name") ??
    labeledValue(body, "Lead Traveller Name") ??
    labeledValue(body, "Lead traveler") ??
    labeledValue(body, "Lead traveller")
  );
}

function extractViatorAmendmentSummary(body: string): string | undefined {
  const block = body.match(/here are the changes:\s*([\s\S]+?)(?:\n\s*\n|\n\s*Booking Details)/i)?.[1];
  if (!block) return undefined;
  const bullets = block
    .split("\n")
    .map((line) =>
      line
        .replace(/^[\s•*\-]+/, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
  return bullets.length > 0 ? bullets.join("; ") : undefined;
}

export function parseViatorMessage(input: GmailMessageInput): ParseResult {
  const body = combineEmailBodies(input.text, input.html);
  const haystack = `${input.subject ?? ""}\n${body}`;
  const externalBookingId =
    haystack.match(/\b(?:Booking Reference|#)\s*:?\s*#?\s*(BR-\d{6,})\b/i)?.[1]?.toUpperCase() ??
    (input.subject ?? "").match(/#?\s*(BR-\d{6,})\b/i)?.[1]?.toUpperCase() ??
    haystack.match(/\b(BR-\d{6,})\b/i)?.[1]?.toUpperCase();
  if (!externalBookingId) {
    return { ok: false, status: "parse_failed", provider: "viator", error: "missing_booking_reference" };
  }
  const eventType = classifyViator(input.subject ?? "", haystack);
  const tourName = extractViatorTourName(body);
  const productCode = labeledValue(body, "Product Code");
  const tourGrade = labeledValue(body, "Tour Grade");
  const tourGradeCode = labeledValue(body, "Tour Grade Code");
  const travelDateRaw =
    labeledValue(body, "Travel Date") ??
    (input.subject ?? "").match(/for\s+([A-Za-z]{3,9},?\s+[A-Za-z]+\s+\d{1,2},?\s+\d{4})/i)?.[1] ??
    (input.subject ?? "").match(/Cancelled Booking:\s*([A-Za-z]{3,9},?\s+[A-Za-z]+\s+\d{1,2},?\s+\d{4})/i)?.[1];
  const sunsetProduct =
    /\bsunset\b/i.test(`${tourName ?? ""} ${productCode ?? ""} ${tourGrade ?? ""} ${input.subject ?? ""}`) ||
    /\b5610231p1\b/i.test(productCode ?? "");
  const clock =
    extractTourGradeTime(tourGrade, tourGradeCode) ?? (sunsetProduct ? { hour: 19, minute: 30 } : null);
  const date = travelDateRaw ? parseCalendarDate(travelDateRaw) : null;
  const startAt =
    date && clock
      ? chicagoDateTime(
          `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`,
          clock.hour,
          clock.minute
        )
      : undefined;
  const travelers = labeledValue(body, "Travelers");
  const details = extractMarketplaceEmailDetails(haystack);
  const phone =
    extractMarketplacePhone(labeledValue(body, "Phone") ?? "") ??
    (details.Phone ? extractMarketplacePhone(details.Phone) : undefined);
  const specialRequirements = labeledValue(body, "Special Requirements");
  if (specialRequirements) details["Special Requirements"] = specialRequirements;
  const amendment = extractViatorAmendmentSummary(haystack);
  if (amendment) details.Amendment = amendment;
  const event: ExternalBookingEvent = {
    provider: "viator",
    eventType,
    externalBookingId,
    externalListingName: tourName,
    externalProductCode: productCode,
    customerName: extractViatorLeadName(body),
    customerEmail: extractMarketplaceGuestEmail(haystack, input.html),
    customerPhone: phone,
    startAt,
    passengerCount: travelerCount(travelers),
    location: labeledValue(body, "Meeting Point") ?? labeledValue(body, "Location"),
    tourGrade,
    tourGradeCode,
    totalCents: extractMarketplaceAmountCents(haystack, ["Net Rate", "Total Net Rate"]) ?? undefined,
    details,
    emailExcerpt: extractMarketplaceEmailExcerpt(haystack),
    sourceMessageId: input.id,
    sourceThreadId: input.threadId,
    sourceSubject: input.subject,
    parseNotes: !startAt ? ["missing_start_time"] : undefined,
  };
  return { ok: true, event };
}
