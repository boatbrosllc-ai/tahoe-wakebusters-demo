export const MARKETPLACE_PROVIDERS = ["boatsetter", "getmyboat", "viator"] as const;
export type MarketplaceProvider = (typeof MARKETPLACE_PROVIDERS)[number];

export const EXTERNAL_BOOKING_EVENT_TYPES = [
  "booking_created",
  "booking_updated",
  "booking_cancelled",
  "informational",
] as const;
export type ExternalBookingEventType = (typeof EXTERNAL_BOOKING_EVENT_TYPES)[number];

export type MarketplaceParseStatus =
  | "ok"
  | "ignored"
  | "unmapped"
  | "needs_review"
  | "parse_failed"
  | "unsupported_sender";

export type ExternalBookingEvent = {
  provider: MarketplaceProvider;
  eventType: ExternalBookingEventType;
  externalBookingId: string;
  externalListingId?: string;
  externalListingName?: string;
  externalProductCode?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  startAt?: Date;
  endAt?: Date;
  passengerCount?: number;
  location?: string;
  captainStatus?: string;
  addonSummary?: string;
  tourGrade?: string;
  tourGradeCode?: string;
  durationHours?: number;
  /** Guest/payout amount from the marketplace email, in cents. */
  totalCents?: number;
  /** Labeled fields copied from the email (earnings, times, policy, etc.). */
  details?: Record<string, string>;
  /** Booking-details excerpt from the email. */
  emailExcerpt?: string;
  sourceMessageId: string;
  sourceThreadId?: string;
  sourceSubject?: string;
  parseNotes?: string[];
};

export type GmailMessageInput = {
  id: string;
  threadId?: string;
  from?: string;
  fromEmail?: string;
  subject?: string;
  snippet?: string;
  text?: string;
  html?: string;
  labels?: string[];
};

export type ProviderDetection = {
  provider: MarketplaceProvider | null;
  reason: string;
};

export type ParseResult =
  | { ok: true; event: ExternalBookingEvent }
  | { ok: false; status: MarketplaceParseStatus; provider?: MarketplaceProvider; error: string; externalBookingId?: string };

export type MarketplaceSyncAction =
  | { type: "ignore"; reason: string }
  | { type: "informational"; reason: string }
  | { type: "create" }
  | { type: "update" }
  | { type: "cancel" }
  | { type: "needs_mapping"; reason: string }
  | { type: "needs_review"; reason: string }
  | { type: "not_found"; reason: string };

export const MARKETPLACE_MATCH_TYPES = ["listing_name", "product_code", "listing_id"] as const;
export type MarketplaceMatchType = (typeof MARKETPLACE_MATCH_TYPES)[number];

/** Statuses written by `recordMarketplaceEvent` for the admin event list. */
export const MARKETPLACE_EVENT_STATUSES = [
  "success",
  "unmapped",
  "needs_review",
  "parse_failed",
  "sync_failed",
  "ignored",
] as const;
export type MarketplaceEventStatus = (typeof MARKETPLACE_EVENT_STATUSES)[number];

export type MarketplaceListingMap = {
  provider: MarketplaceProvider;
  matchType: MarketplaceMatchType;
  matchValue: string;
  experienceSlug?: string;
  experienceId?: string;
  boatId?: string;
  durationHours?: number;
  /** True when the app guessed this mapping from the listing name. */
  autoMapped?: boolean;
};

export type ResolvedMarketplaceMapping = MarketplaceListingMap & {
  experienceId: string;
  experienceSlug: string;
  durationHours?: number;
};

export function buildExternalKey(provider: MarketplaceProvider, externalBookingId: string): string {
  return `${provider}:${externalBookingId.trim().toLowerCase()}`;
}

export function normalizeListingKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[®™]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
