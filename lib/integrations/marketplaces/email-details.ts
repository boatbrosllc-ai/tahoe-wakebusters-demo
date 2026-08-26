import { labeledValue } from "./html-to-text";

const DETAIL_LABELS = [
  "Booking ID",
  "Booking Reference",
  "Renter",
  "Lead Traveler Name",
  "Lead Traveller Name",
  "Traveler Names",
  "Traveller Names",
  "Travelers",
  "Location",
  "Meeting Point",
  "Start",
  "End",
  "Depart",
  "Return",
  "Travel Date",
  "Duration",
  "Passengers",
  "Group Size",
  "Captain",
  "Add-ons",
  "Add ons",
  "Tour Name",
  "Product Code",
  "Tour Grade",
  "Tour Grade Code",
  "Tour Grade Description",
  "Tour Language",
  "Listing",
  "Street Address For Arrival",
  "Street Address",
  "Departure Location",
  "You earn",
  "You earned",
  "Earnings",
  "Your Payout",
  "Payout",
  "Owner payout",
  "Renter Payments",
  "Base Cost",
  "Ice",
  "Service Fee",
  "Payment Service Fee",
  "Net Rate",
  "Total Net Rate",
  "Retail Price",
  "Total Retail Price",
  "Booking total",
  "Booking Amount",
  "Amount paid",
  "Special Requirements",
  "Phone",
  "Email",
  "Guest email",
  "Renter email",
  "Customer email",
];

const JUNK_VALUE = /^(you earn|learn more|view booking|edit booking|here\b|click here|instagram|facebook)/i;

function cleanValue(raw: string | undefined): string | undefined {
  const v = raw?.replace(/\s+/g, " ").trim();
  if (!v || JUNK_VALUE.test(v)) return undefined;
  return v;
}

/** Structured fields copied from the marketplace email so nothing useful is dropped. */
export function extractMarketplaceEmailDetails(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!body) return out;
  for (const label of DETAIL_LABELS) {
    const v = cleanValue(labeledValue(body, label));
    if (!v) continue;
    out[label] = v;
  }
  const policy = body.match(/cancellation policy is:\s*([a-z]+)/i)?.[1];
  if (policy) out["Cancellation policy"] = policy.toLowerCase();
  if (/instant book means/i.test(body)) out["Instant Book"] = "automatically approved";
  if (/instant confirmation/i.test(body)) out["Instant Confirmation"] = "No action required";
  const earn =
    cleanValue(out["You earn"]) ??
    cleanValue(out["You earned"]) ??
    cleanValue(out.Earnings) ??
    cleanValue(out["Your Payout"]) ??
    cleanValue(out["Net Rate"]) ??
    body.match(/get ready to earn\s*(\$[0-9,]+\.\d{2})/i)?.[1] ??
    body.match(/you earn\s*(\$[0-9,]+\.\d{2})/i)?.[1];
  if (earn) out.Earnings = earn;
  const refund = body.match(/(\d+%\s+refund[^\n.]+\.?)/i)?.[1];
  if (refund) out["Cancellation policy"] = refund.trim();
  if (/service fees are non-refundable/i.test(body) && !out["Service fees"]) {
    out["Service fees"] = "non-refundable";
  }
  if (out.Phone) {
    const phone = extractMarketplacePhone(out.Phone);
    if (phone) out.Phone = phone;
  }
  return out;
}

/** Pull a usable phone from Viator `Phone: (Alternate Phone)US+1 7183627556 ...` style lines. */
export function extractMarketplacePhone(raw: string): string | undefined {
  const cleaned = raw.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, " ");
  const usPacked = cleaned.match(/US\s*\+?\s*1[\s.()-]*(\d{10})\b/i);
  if (usPacked) return `+1 ${usPacked[1]}`;
  const usCountryFormatted = cleaned.match(
    /(?:US\s*)?\+?\s*1[\s.()-]*\(?\s*(\d{3})\s*\)?[\s.-]*(\d{3})[\s.-]*(\d{4})\b/i
  );
  if (usCountryFormatted) return `+1 ${usCountryFormatted[1]}${usCountryFormatted[2]}${usCountryFormatted[3]}`;
  const usSplit = cleaned.match(/\+?\s*1[\s.-]*(\d{3})[\s.-]*(\d{3})[\s.-]*(\d{4})\b/);
  if (usSplit) return `+1 ${usSplit[1]}${usSplit[2]}${usSplit[3]}`;
  const usParen = cleaned.match(/\(\s*(\d{3})\s*\)[\s.-]*(\d{3})[\s.-]*(\d{4})\b/);
  if (usParen) return `+1 ${usParen[1]}${usParen[2]}${usParen[3]}`;
  const intl = cleaned.match(/(\+\d{7,15})\b/);
  return intl?.[1];
}

const EXCERPT_END =
  /\n\s*(?:Questions\?|Privacy Policy|Instagram|This message has been sent|VIEW BOOKING DETAILS|Share your trip stories|Have questions or need help|Need help or have a question|Download the Getmyboat app|Management Center)/i;

/** Booking-details section of the email, capped so we keep the facts without the footer. */
export function extractMarketplaceEmailExcerpt(body: string): string | undefined {
  if (!body) return undefined;
  const start = body.search(
    /\b(?:Booking ID|Booking Reference|Booking Details|Booking Confirmed|You received an Instant Booking)\b/i
  );
  const sliced = (start >= 0 ? body.slice(start) : body).trim();
  const end = sliced.search(EXCERPT_END);
  const chunk = (end > 80 ? sliced.slice(0, end) : sliced).replace(/\n{3,}/g, "\n\n").trim();
  if (chunk.length < 20) return undefined;
  return chunk.slice(0, 4000);
}

export function formatMarketplaceNotes(
  event: {
    provider: string;
    externalBookingId: string;
    externalListingName?: string;
    location?: string;
    captainStatus?: string;
    addonSummary?: string;
    details?: Record<string, string>;
  }
): string {
  const earnings =
    event.details?.Earnings ??
    event.details?.["You earn"] ??
    event.details?.["Your Payout"] ??
    event.details?.["Net Rate"];
  const guestPaid = event.details?.["Renter Payments"];
  const policy = event.details?.["Cancellation policy"];
  return [
    event.provider,
    `Ref: ${event.externalBookingId}`,
    event.externalListingName,
    event.location,
    event.captainStatus,
    event.addonSummary ? `Add-ons: ${event.addonSummary}` : null,
    earnings ? `Earnings: ${earnings}` : null,
    guestPaid ? `Guest paid: ${guestPaid}` : null,
    policy ? `Cancellation: ${policy}` : null,
    event.details?.Amendment ? `Amendment: ${event.details.Amendment}` : null,
  ]
    .filter(Boolean)
    .join(" — ");
}
