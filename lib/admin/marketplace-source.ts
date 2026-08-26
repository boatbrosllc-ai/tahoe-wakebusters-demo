import {
  displayMarketplaceGuestEmail,
  isSyntheticMarketplaceGuestEmail,
} from "@/lib/integrations/marketplaces/guest-contact";

export const MARKETPLACE_SOURCE_IDS = ["boatsetter", "getmyboat", "viator"] as const;
export type MarketplaceSourceId = (typeof MARKETPLACE_SOURCE_IDS)[number];

export type MarketplaceSourceStyle = {
  id: MarketplaceSourceId;
  label: string;
  /** `rgb(r g b)` for calendar inline styles */
  rgb: string;
  pillClass: string;
};

/** Convert `rgb(r g b)` or `#rrggbb` to a translucent fill. Appending hex alpha to `rgb()` is invalid CSS. */
export function colorWithAlpha(color: string, alpha: number): string {
  if (color.startsWith("#") && (color.length === 7 || color.length === 4)) {
    const hex = Math.round(alpha * 255)
      .toString(16)
      .padStart(2, "0");
    return `${color}${hex}`;
  }
  const m = color.match(/rgb\((\d+)\s+(\d+)\s+(\d+)\)/);
  if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
  return color;
}

export const MARKETPLACE_SOURCE_STYLES: Record<MarketplaceSourceId, MarketplaceSourceStyle> = {
  boatsetter: {
    id: "boatsetter",
    label: "Boatsetter",
    rgb: "rgb(59 130 246)",
    pillClass: "bg-blue-500 text-white ring-1 ring-blue-700",
  },
  getmyboat: {
    id: "getmyboat",
    label: "Getmyboat",
    rgb: "rgb(234 88 12)",
    pillClass: "bg-orange-500 text-white ring-1 ring-orange-700",
  },
  viator: {
    id: "viator",
    label: "Viator",
    rgb: "rgb(236 72 153)",
    pillClass: "bg-pink-500 text-white ring-1 ring-pink-700",
  },
};

export type MarketplaceSourceFields = {
  source?: string | null;
  externalProvider?: string | null;
  externalBookingId?: string | null;
  externalListingName?: string | null;
  externalKey?: string | null;
  specialNotes?: string | null;
  marketplaceDetails?: Record<string, string> | null;
  marketplaceEmailExcerpt?: string | null;
  rateId?: string | null;
  customer?: { email?: string | null } | null;
};

export function normalizeMarketplaceSource(raw: string | null | undefined): MarketplaceSourceId | null {
  const s = (raw ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (!s) return null;
  if (s.includes("boatsetter")) return "boatsetter";
  if (s.includes("getmyboat")) return "getmyboat";
  if (s.includes("viator")) return "viator";
  return null;
}

function detectMarketplaceProviderInText(raw: string | null | undefined): MarketplaceSourceId | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (/\bboatsetter\b/.test(lower) || lower.includes("boatsetter")) return "boatsetter";
  if (/\bget\s*my\s*boat\b/.test(lower) || lower.includes("getmyboat")) return "getmyboat";
  if (/\bviator\b/.test(lower) || lower.includes("viator")) return "viator";
  return null;
}

function providerFromExternalKey(raw: string | null | undefined): MarketplaceSourceId | null {
  const key = (raw ?? "").trim();
  if (!key) return null;
  const prefix = key.split(":")[0];
  return normalizeMarketplaceSource(prefix);
}

function providerFromSyntheticEmail(email: string | null | undefined): MarketplaceSourceId | null {
  const m = (email ?? "").trim().toLowerCase().match(/^marketplace\+(boatsetter|getmyboat|viator)[-@]/);
  return m ? normalizeMarketplaceSource(m[1]) : null;
}

export type FinancialChannelId = "direct" | MarketplaceSourceId;

export const FINANCIAL_CHANNEL_ORDER: FinancialChannelId[] = [
  "direct",
  "boatsetter",
  "getmyboat",
  "viator",
];

export const FINANCIAL_CHANNEL_LABELS: Record<FinancialChannelId, string> = {
  direct: "Direct (site & Stripe)",
  boatsetter: MARKETPLACE_SOURCE_STYLES.boatsetter.label,
  getmyboat: MARKETPLACE_SOURCE_STYLES.getmyboat.label,
  viator: MARKETPLACE_SOURCE_STYLES.viator.label,
};

export function financialChannelFromBooking(input: MarketplaceSourceFields): FinancialChannelId {
  return resolveMarketplaceSource(input)?.id ?? "direct";
}

export { displayMarketplaceGuestEmail, isSyntheticMarketplaceGuestEmail };

export function customerContactForAdminApi<T extends { email?: string | null } | null | undefined>(customer: T): T {
  if (!customer) return customer;
  return { ...customer, email: displayMarketplaceGuestEmail(customer.email) };
}

/** Boatsetter / Getmyboat / Viator already send their own guest confirmation. */
export function isMarketplaceBookingSource(input: MarketplaceSourceFields): boolean {
  if (resolveMarketplaceSource(input) != null) return true;
  return (input.rateId ?? "").trim().toLowerCase() === "marketplace";
}

/** Website/Stripe (and phone/admin) bookings get a the operator confirmation email. Marketplace ingest does not. */
export function bookingExpectsWebsiteGuestConfirmation(input: MarketplaceSourceFields): boolean {
  return !isMarketplaceBookingSource(input);
}

export function resolveMarketplaceSource(input: MarketplaceSourceFields): MarketplaceSourceStyle | null {
  const fromProvider = normalizeMarketplaceSource(input.externalProvider);
  if (fromProvider) return MARKETPLACE_SOURCE_STYLES[fromProvider];
  const fromSource = normalizeMarketplaceSource(input.source);
  if (fromSource) return MARKETPLACE_SOURCE_STYLES[fromSource];
  const fromKey = providerFromExternalKey(input.externalKey);
  if (fromKey) return MARKETPLACE_SOURCE_STYLES[fromKey];
  const fromEmail = providerFromSyntheticEmail(input.customer?.email);
  if (fromEmail) return MARKETPLACE_SOURCE_STYLES[fromEmail];
  const detailsBlob = input.marketplaceDetails ? Object.entries(input.marketplaceDetails).flat().join("\n") : "";
  const fromText = detectMarketplaceProviderInText(
    [input.specialNotes, input.marketplaceEmailExcerpt, input.externalListingName, detailsBlob].filter(Boolean).join("\n")
  );
  if (fromText) return MARKETPLACE_SOURCE_STYLES[fromText];
  return null;
}

export function pickMarketplaceBookingApiFields(booking: MarketplaceSourceFields): {
  source: string | null;
  externalProvider: string | null;
  externalBookingId: string | null;
  externalListingName: string | null;
  externalKey: string | null;
  marketplaceDetails: Record<string, string> | null;
  marketplaceEmailExcerpt: string | null;
} {
  const details = booking.marketplaceDetails && Object.keys(booking.marketplaceDetails).length > 0
    ? booking.marketplaceDetails
    : null;
  return {
    source: booking.source?.trim() || null,
    externalProvider: booking.externalProvider?.trim() || null,
    externalBookingId: booking.externalBookingId?.trim() || null,
    externalListingName: booking.externalListingName?.trim() || null,
    externalKey: booking.externalKey?.trim() || null,
    marketplaceDetails: details,
    marketplaceEmailExcerpt: booking.marketplaceEmailExcerpt?.trim() || null,
  };
}

/** Canonical source fields when an admin picks a marketplace in Add Booking. */
export function marketplaceFieldsFromAdminSource(
  sourceRaw: string,
  externalReference?: string
): {
  source?: string;
  externalProvider?: MarketplaceSourceId;
  externalBookingId?: string;
  externalKey?: string;
} {
  const trimmed = sourceRaw.trim();
  if (!trimmed) return {};
  const id = normalizeMarketplaceSource(trimmed);
  if (!id) return { source: trimmed };
  const ref = externalReference?.trim();
  return {
    source: id,
    externalProvider: id,
    ...(ref
      ? {
          externalBookingId: ref,
          externalKey: `${id}:${ref}`,
        }
      : {}),
  };
}
