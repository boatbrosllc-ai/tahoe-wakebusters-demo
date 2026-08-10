/**
 * Marketing packages (Nasty / Nastier / Nastiest).
 *
 * Ladder (one decision on the homepage):
 *   Nasty    = Half Day charter (5h) — a la carte add-ons at checkout
 *   Nastier  = Full Day charter (8h) — a la carte add-ons at checkout
 *   Nastiest = Full Day all-in — Full Day + packaged upsells preselected
 *
 * These are NOT separate boats or calendars. Each resolves to:
 *   experience slug (pontoon | watersports) + durationHours + optional addon catalogKeys
 *
 * Checkout still uses create-hold → pricing snapshot → PaymentIntent.
 * Display "from" prices are marketing only — never hard-code checkout totals.
 */

import {
  FOUNDING_ANGLER_RATE_ACTIVE,
  formatUsdFromCents,
  getActiveCatalogRateCents,
  STANDARD_RATE_CENTS,
} from "@/content/catalog-pricing";

export type BundleId = "nasty" | "nastier" | "nastiest";

export type BundleCharterOption = {
  experienceSlug: "pontoon" | "watersports";
  durationHours: number;
  label: string;
};

export type BundlePreset = {
  id: BundleId;
  title: string;
  tagline: string;
  description: string;
  /** Short bullets for the package card. */
  includes: string[];
  /** Marketing starting price label only — not charged. */
  fromPriceLabel: string;
  /** Single charter this package books (same boat inventory). */
  charterOptions: BundleCharterOption[];
  /** Always 0 — one trip per package. */
  defaultOptionIndex: number;
  /** Addon catalogKeys to preselect (must match seed ExperienceAddon.catalogKey). Empty = a la carte only. */
  addonCatalogKeys: string[];
  badge?: string;
  ctaLabel: string;
  /** Highlight as recommended (usually the middle tier). */
  recommended?: boolean;
};

/** Display seeds for add-on marketing math (not charged totals) — mid/suggested from content/upsells. */
const ADDON_DISPLAY_CENTS: Record<string, number> = {
  "resort-transportation": 174_00,
  "premium-breakfast": 129_00,
  "premium-lunch": 199_00,
  "fish-processing": 30_00,
  "resort-fish-delivery": 64_00,
  "nasty-gear-pack": 119_00,
};

function sumAddonDisplay(keys: string[]): number {
  return keys.reduce((sum, k) => sum + (ADDON_DISPLAY_CENTS[k] ?? 0), 0);
}

const nastyHalf = getActiveCatalogRateCents("half");
const nastyFull = getActiveCatalogRateCents("full");

/**
 * Nastiest all-in preselects (Beer/Seltzer omitted until licensing).
 * catalogKeys must match content/upsells.ts.
 */
const NASTIEST_ADDONS = [
  "resort-transportation",
  "premium-lunch",
  "fish-processing",
  "resort-fish-delivery",
  "nasty-gear-pack",
] as const;

const nastiestFrom = nastyFull + sumAddonDisplay([...NASTIEST_ADDONS]);

export const bundlePresets: BundlePreset[] = [
  {
    id: "nasty",
    title: "Nasty",
    tagline: "Half Day",
    description: "5-hour private Cabo charter. Captain, crew, tackle, bait, and provisions. Add upgrades a la carte at checkout.",
    includes: [
      "5-hour private charter",
      "Morning (6:00 AM) or Afternoon (2:00 PM)",
      "Captain & mate",
      "Tackle, bait & licenses",
      "Snacks, water & soft drinks",
    ],
    fromPriceLabel: `From ${formatUsdFromCents(nastyHalf)}`,
    charterOptions: [
      { experienceSlug: "pontoon", durationHours: 5, label: "Nasty Half Day · 5 Hours" },
    ],
    defaultOptionIndex: 0,
    addonCatalogKeys: [],
    ctaLabel: "Book Nasty",
  },
  {
    id: "nastier",
    title: "Nastier",
    tagline: "Full Day",
    description: "8-hour private offshore charter departing 6:00 AM — optional +1/+2/+3 hours to stay until 5:00 PM. Same boat. Add upgrades a la carte at checkout.",
    includes: [
      "8-hour private charter (6:00 AM start)",
      "Optional +1 to +3 hours",
      "Captain & mate",
      "Tackle, bait & licenses",
      "Snacks, water & soft drinks",
    ],
    fromPriceLabel: `From ${formatUsdFromCents(nastyFull)}`,
    charterOptions: [
      { experienceSlug: "watersports", durationHours: 8, label: "Nasty Full Day · 8 Hours" },
    ],
    defaultOptionIndex: 0,
    addonCatalogKeys: [],
    ctaLabel: "Book Nastier",
  },
  {
    id: "nastiest",
    title: "Nastiest",
    tagline: "Full Day All-In",
    description: "Full Day charter with private resort transport, premium offshore lunch, catch processing + resort delivery, and gear — optional +1/+2/+3 hours. The done-for-you Cabo fishing day.",
    includes: [
      "8-hour private charter (6:00 AM start)",
      "Optional +1 to +3 hours",
      "Private resort transportation",
      "Premium offshore lunch",
      "Fish processing + resort delivery",
      "Nasty Gear Pack",
    ],
    fromPriceLabel: `From ${formatUsdFromCents(nastiestFrom)}+`,
    charterOptions: [
      { experienceSlug: "watersports", durationHours: 8, label: "Full Day · All-In" },
    ],
    defaultOptionIndex: 0,
    addonCatalogKeys: [...NASTIEST_ADDONS],
    recommended: true,
    ctaLabel: "Book Nastiest",
  },
];

export function getBundlePreset(id: BundleId): BundlePreset | undefined {
  return bundlePresets.find((b) => b.id === id);
}

/** Help copy when founding rates are on. */
export function foundingRateCallout(): string | null {
  if (!FOUNDING_ANGLER_RATE_ACTIVE) return null;
  return `Founding Angler rates active — Half Day ${formatUsdFromCents(getActiveCatalogRateCents("half"))} / Full Day ${formatUsdFromCents(getActiveCatalogRateCents("full"))} (standard ${formatUsdFromCents(STANDARD_RATE_CENTS.half)} / ${formatUsdFromCents(STANDARD_RATE_CENTS.full)}). Peak Full Day from ${formatUsdFromCents(239_500)} on selected dates.`;
}
