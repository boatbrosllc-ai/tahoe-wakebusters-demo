import { bookingAssignedToCaptain, readAssignedCaptain, type AssignedCaptainPublic } from "./assigned-captain";
import type { AdminRole } from "./roles";

export type CalendarEventCustomer = {
  name: string;
  email?: string;
  phone?: string;
};

const FINANCIAL_MARKETPLACE_LABEL =
  /^(you earn(?:ed)?|earnings|your payout|payout|owner payout|renter payments|base cost|service fee(?:s)?|payment service fee|net rate|total net rate|retail price|total retail price|booking total|booking amount|amount paid)$/i;

const FINANCIAL_NOTE_CHUNK =
  /\s*[—–-]\s*(?:earnings|guest paid|your payout|you earn(?:ed)?|net rate)\s*:[^—–\n]*/gi;

const FINANCIAL_NOTE_INLINE =
  /\b(?:earnings|guest paid|your payout|you earn(?:ed)?|net rate)\s*:\s*\$?[\d,]+(?:\.\d{2})?/gi;

/** Subset of calendar-events payload we sanitize for captains. */
export type CalendarEventLike = {
  type: "booking" | "block";
  pricing?: { totalCents?: number; currency?: string } | null;
  customer?: CalendarEventCustomer | null;
  assignedCaptain?: AssignedCaptainPublic | null;
  captainEmail?: string | null;
  specialNotes?: string | null;
  marketplaceDetails?: Record<string, string> | null;
  marketplaceEmailExcerpt?: string | null;
  [key: string]: unknown;
};

export function captainSafeMarketplaceDetails(
  details: Record<string, string> | null | undefined
): Record<string, string> | null {
  if (!details) return null;
  const out: Record<string, string> = {};
  for (const [label, value] of Object.entries(details)) {
    if (!value?.trim()) continue;
    if (FINANCIAL_MARKETPLACE_LABEL.test(label.trim())) continue;
    out[label] = value;
  }
  return Object.keys(out).length ? out : null;
}

/** Keep guest/ops notes; drop payout fragments that marketplace imports stuff into specialNotes. */
export function captainSafeNotes(notes: string | null | undefined): string | null {
  if (!notes?.trim()) return null;
  const cleaned = notes
    .replace(FINANCIAL_NOTE_CHUNK, "")
    .replace(FINANCIAL_NOTE_INLINE, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+[—–]\s*$/g, "")
    .trim();
  return cleaned || null;
}

/**
 * Captains only receive their assigned bookings, with no price and no guest email.
 * Returns null when the event must be omitted.
 */
export function filterCalendarEventForRole(
  event: CalendarEventLike,
  role: AdminRole,
  viewerEmail: string
): CalendarEventLike | null {
  if (role !== "captain") return event;
  if (event.type !== "booking") return null;
  if (!bookingAssignedToCaptain(event, viewerEmail)) return null;
  const assignedCaptain = readAssignedCaptain(event);
  const customer = event.customer;
  const {
    pricing: _pricing,
    marketplaceEmailExcerpt: _excerpt,
    ...rest
  } = event;
  return {
    ...rest,
    pricing: undefined,
    marketplaceEmailExcerpt: undefined,
    marketplaceDetails: captainSafeMarketplaceDetails(event.marketplaceDetails),
    specialNotes: captainSafeNotes(event.specialNotes),
    customer: customer
      ? {
          name: customer.name ?? "",
          phone: customer.phone ?? "",
        }
      : { name: "", phone: "" },
    assignedCaptain,
    captainEmail: assignedCaptain?.email ?? null,
  };
}

export function calendarEventHasPricing(event: { pricing?: { totalCents?: number } | null }): boolean {
  return event.pricing != null && typeof event.pricing.totalCents === "number";
}
