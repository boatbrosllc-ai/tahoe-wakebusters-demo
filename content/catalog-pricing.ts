/**
 * Nasty Sport Fishing — catalog pricing presentation & seed defaults.
 *
 * Charged amounts still flow through Firestore rates → create-hold → computePricing.
 * This file only decides which cents we write onto rate.priceCents when seeding/reconciling,
 * and what marketing badges to show. It does NOT replace lib/booking/pricing.ts.
 *
 * TAX: live money math remains in lib/booking/constants.ts (TAX_RATE still
 * legacy pending Cabo IVA decision). PROCESSING_FEE_RATE is 0 — published
 * rates absorb payment-processing cost; no customer surcharge at checkout.
 */

export type CharterKind = "half" | "full";

/** When true, seed/reconcile writes founder cents onto rate.priceCents (new holds only). */
export const FOUNDING_ANGLER_RATE_ACTIVE = true;

/** Customer-facing badge when founding rates are active. Not a coupon code. */
export const FOUNDING_ANGLER_LABEL = "FOUNDING ANGLER RATE";

/** Standard advertised rates (USD cents), before tax/fees. */
export const STANDARD_RATE_CENTS: Record<CharterKind, number> = {
  half: 149_500, // $1,495
  full: 209_500, // $2,095
};

/** Temporary launch rates (USD cents), before tax/fees. */
export const FOUNDING_RATE_CENTS: Record<CharterKind, number> = {
  half: 129_500, // $1,295
  full: 189_500, // $1,895
};

/**
 * Peak / tournament Full Day override (USD cents).
 * Applied via rate.priceHolidayCents + experience.holidayDates or pricing calendar —
 * not a separate experience/boat.
 */
export const PEAK_FULL_DAY_CENTS = 239_500; // $2,395+

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

/** Shared included list for Half Day + Full Day charters. */
export const CHARTER_INCLUDED: string[] = [
  "Private boat",
  "Captain and mate",
  "Premium tackle",
  "Live bait allowance",
  "Fishing licenses for up to four anglers",
  "Water",
  "Soft drinks",
  "Snacks",
  "Light breakfast",
  "Crew photos of the catch",
  "Local-grounds fuel",
];
