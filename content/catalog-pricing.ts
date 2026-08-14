/**
 * Catalog pricing presentation & seed defaults.
 *
 * Charged amounts still flow through Firestore rates → create-hold → computePricing.
 * This file only decides which cents we write onto rate.priceCents when seeding,
 * and what marketing badges to show. It does NOT replace lib/booking/pricing.ts.
 *
 * Replace these placeholder cents from a Slipstack.io launch packet (or admin)
 * before a real customer goes live. FOUNDING_ANGLER_RATE_ACTIVE stays off in the template.
 */

export type CharterKind = "half" | "full";

/** When true, seed/reconcile writes founder cents onto rate.priceCents (new holds only). */
export const FOUNDING_ANGLER_RATE_ACTIVE = false;

/** Customer-facing badge when founding rates are active. Not a coupon code. */
export const FOUNDING_ANGLER_LABEL = "LAUNCH RATE";

/** Placeholder advertised rates (USD cents), before tax/fees. Replace per customer. */
export const STANDARD_RATE_CENTS: Record<CharterKind, number> = {
  half: 50_000, // $500
  full: 80_000, // $800
};

/** Optional launch rates (USD cents). Unused while FOUNDING_ANGLER_RATE_ACTIVE is false. */
export const FOUNDING_RATE_CENTS: Record<CharterKind, number> = {
  half: 50_000,
  full: 80_000,
};

/**
 * Peak / holiday Full Day override (USD cents).
 * Applied via rate.priceHolidayCents + experience.holidayDates or pricing calendar.
 */
export const PEAK_FULL_DAY_CENTS = 100_000; // $1,000

export function getActiveCatalogRateCents(kind: CharterKind): number {
  return FOUNDING_ANGLER_RATE_ACTIVE ? FOUNDING_RATE_CENTS[kind] : STANDARD_RATE_CENTS[kind];
}

export function formatUsdFromCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Shared included list for Half Day + Full Day charters. Customer should replace via seed/admin. */
export const CHARTER_INCLUDED: string[] = [
  "Private boat",
  "Captain and crew",
  "Life jackets",
  "Water",
];
