import { isValidBookingEmail } from "@/lib/booking/validate-email";
import { validatePhone } from "@/lib/booking/validate-phone";
import { parseAdsAttributionFromUnknown, type AdsAttribution } from "@/lib/ads/attribution";

export const LEAD_INTERESTS = [
  "pontoon",
  "wake",
  "sunset",
  "bachelorette",
  "bachelor",
  "birthday",
  "other",
] as const;

export type LeadInterest = (typeof LEAD_INTERESTS)[number];

export const LEAD_NAME_MAX = 120;
export const LEAD_PHONE_MAX = 40;
export const LEAD_SOURCE_MAX = 200;
export const LEAD_PAGE_MAX = 200;
export const LEAD_MESSAGE_MAX = 10_000;

export type ParsedLeadCapture = {
  email: string;
  name: string;
  phone: string;
  source: string;
  page: string;
  interest: LeadInterest | null;
  message: string;
  adsAttribution?: AdsAttribution;
};

const SOURCE_LABELS: Record<string, string> = {
  home_lead_capture: "Homepage",
  contact: "Contact form",
  "austin-bachelorette-boat-rental": "Bachelorette page",
  "austin-bachelor-party-boat-rental": "Bachelor page",
  "pontoon-boat-rental-austin": "Pontoon rental page",
};

const INTEREST_LABELS: Record<LeadInterest, string> = {
  pontoon: "Pontoon charter",
  wake: "Wake boat",
  sunset: "Sunset cruise",
  bachelorette: "Bachelorette",
  bachelor: "Bachelor party",
  birthday: "Birthday",
  other: "Other",
};

export function isLeadInterest(value: unknown): value is LeadInterest {
  return typeof value === "string" && (LEAD_INTERESTS as readonly string[]).includes(value);
}

export function leadInterestLabel(interest: string | null | undefined): string {
  if (!interest) return "Unknown";
  if (isLeadInterest(interest)) return INTEREST_LABELS[interest];
  return interest.replace(/[_-]/g, " ");
}

export function leadSourceLabel(source: string | null | undefined): string {
  if (!source) return "Unknown";
  if (SOURCE_LABELS[source]) return SOURCE_LABELS[source];
  return source.replace(/[_-]/g, " ");
}

export function daysWaiting(capturedAt: string | null | undefined, nowMs = Date.now()): number | null {
  if (!capturedAt) return null;
  const t = Date.parse(capturedAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / (24 * 60 * 60 * 1000)));
}

export function publicBookingPath(interest?: string | null): string {
  if (interest === "wake") return "/experiences/watersports";
  if (interest === "sunset") return "/experiences/sunset";
  if (interest === "bachelorette") return "/austin-bachelorette-boat-rental";
  if (interest === "bachelor") return "/austin-bachelor-party-boat-rental";
  return "/book";
}

export type SuggestedLeadEmail = {
  id: string;
  label: string;
  subject: string;
  body: string;
};

export function suggestedLeadEmails(opts: {
  firstName: string;
  interest: string | null;
  bookingUrl: string;
}): SuggestedLeadEmail[] {
  const name = opts.firstName.trim() || "there";
  const interestLine = opts.interest && opts.interest !== "other"
    ? ` about a ${leadInterestLabel(opts.interest).toLowerCase()}`
    : "";
  return [
    {
      id: "availability",
      label: "Send availability",
      subject: "Lake Austin availability — Admin",
      body: `Hi ${name},\n\nThanks for reaching out${interestLine}. You can check live times and book here:\n\n${opts.bookingUrl}\n\nIf you share a date and group size, I can point you at the best boat.\n\n— Slipstack`,
    },
    {
      id: "follow_up",
      label: "Friendly follow-up",
      subject: "Still thinking about a Lake Austin boat day?",
      body: `Hi ${name},\n\nJust checking in — we still have openings this season. Book online anytime:\n\n${opts.bookingUrl}\n\nHappy to help you pick a boat if you want a recommendation.\n\n— Slipstack`,
    },
  ];
}

export function parseLeadCaptureBody(body: unknown): ParsedLeadCapture | { error: string } {
  if (body == null || typeof body !== "object") return { error: "Request body must be a JSON object." };
  const o = body as Record<string, unknown>;
  const email = typeof o.email === "string" ? o.email.trim().slice(0, 254) : "";
  const name = typeof o.name === "string" ? o.name.trim().slice(0, LEAD_NAME_MAX) : "";
  const phoneRaw = typeof o.phone === "string" ? o.phone.trim().slice(0, LEAD_PHONE_MAX) : "";
  const source = typeof o.source === "string" && o.source.trim()
    ? o.source.trim().slice(0, LEAD_SOURCE_MAX)
    : "unknown";
  const page = typeof o.page === "string" ? o.page.trim().slice(0, LEAD_PAGE_MAX) : "";
  const interestRaw = typeof o.interest === "string" ? o.interest.trim().toLowerCase() : "";
  const interest = isLeadInterest(interestRaw) ? interestRaw : null;
  const message = typeof o.message === "string" ? o.message.trim().slice(0, LEAD_MESSAGE_MAX) : "";

  if (!email || !isValidBookingEmail(email)) return { error: "Valid email required" };
  if (phoneRaw) {
    const phoneCheck = validatePhone(phoneRaw);
    if (!phoneCheck.valid) return { error: phoneCheck.error };
  }

  const adsAttribution = parseAdsAttributionFromUnknown(o.adsAttribution);

  return { email, name, phone: phoneRaw, source, page, interest, message, ...(adsAttribution ? { adsAttribution } : {}) };
}
