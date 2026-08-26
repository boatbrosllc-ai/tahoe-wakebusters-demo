/**
 * Catalog pricing for Tahoe Wakebusters demo.
 * Seeded rates for Party Barge half/full; other boats use experience-level notes.
 */

export type CharterKind = "half" | "full";

export const FOUNDING_ANGLER_RATE_ACTIVE = false;
export const FOUNDING_ANGLER_LABEL = "LAUNCH RATE";

/** Party Barge advertised rates (USD cents), before tax. */
export const STANDARD_RATE_CENTS: Record<CharterKind, number> = {
  half: 170_000, // $1,700 · 4 hrs
  full: 300_000, // $3,000 · 8 hrs
};

export const FOUNDING_RATE_CENTS: Record<CharterKind, number> = {
  half: 170_000,
  full: 300_000,
};

export const PEAK_FULL_DAY_CENTS = 300_000;

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

export const CHARTER_INCLUDED: string[] = [
  "Full tank of gas",
  "Water toys, floaties & gear",
  "Coolers & Bluetooth stereo",
  "Life jackets & safety gear",
];
