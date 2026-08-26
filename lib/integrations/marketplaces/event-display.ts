import { payoutCentsFromMarketplaceFields } from "./money";

const NAME_DETAIL_KEYS = ["Renter", "Lead Traveler Name", "Lead Traveller Name", "Traveler Names", "Traveller Names", "Travelers"];

function cleanName(value: string | null | undefined): string | null {
  const name = value?.trim() ?? "";
  if (!name) return null;
  if (/^marketplace guest$/i.test(name)) return null;
  if (/^marketplace\+/i.test(name)) return null;
  return name;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asDetails(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string") out[key] = raw;
  }
  return out;
}

function asCents(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Firestore marketplace event docs are untyped records; read known fields defensively. */
export function marketplaceEventGuestName(
  event: Record<string, unknown> | { customerName?: string | null; details?: Record<string, string> | null },
  booking?: { customer?: { name?: string | null } | null } | null
): string | null {
  const fromEvent = cleanName(asString((event as { customerName?: unknown }).customerName));
  if (fromEvent) return fromEvent;
  const details = asDetails((event as { details?: unknown }).details);
  for (const key of NAME_DETAIL_KEYS) {
    const fromDetails = cleanName(details[key]);
    if (fromDetails) return fromDetails;
  }
  return cleanName(booking?.customer?.name);
}

export function marketplaceEventAmountCents(
  event: Record<string, unknown> | { totalCents?: number | null; details?: Record<string, string> | null; emailExcerpt?: string | null },
  booking?: { pricing?: { totalCents?: number | null } | null; marketplaceDetails?: Record<string, string> | null; marketplaceEmailExcerpt?: string | null } | null
): number | null {
  const fromEvent = payoutCentsFromMarketplaceFields({
    totalCents: asCents((event as { totalCents?: unknown }).totalCents),
    details: asDetails((event as { details?: unknown }).details),
    excerpt: asString((event as { emailExcerpt?: unknown }).emailExcerpt),
  });
  if (fromEvent) return fromEvent;
  const fromBookingStored =
    typeof booking?.pricing?.totalCents === "number" && booking.pricing.totalCents > 0
      ? Math.floor(booking.pricing.totalCents)
      : null;
  if (fromBookingStored) return fromBookingStored;
  return payoutCentsFromMarketplaceFields({
    details: booking?.marketplaceDetails,
    excerpt: booking?.marketplaceEmailExcerpt,
  });
}

export function formatMarketplaceUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
