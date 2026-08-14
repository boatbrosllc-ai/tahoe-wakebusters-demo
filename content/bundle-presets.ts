/**
 * Marketing packages (Half Day / Full Day / All-In).
 *
 * Ladder (one decision on the homepage):
 *   nasty    = Half Day charter (5h) — a la carte add-ons at checkout
 *   nastier  = Full Day charter (8h) — a la carte add-ons at checkout
 *   nastiest = Full Day all-in — Full Day + packaged upsells preselected
 *
 * Bundle IDs are stable checkout keys — do not rename them.
 * Display titles come from siteConfig.catalog.
 */

import { siteConfig } from "@/config/site";
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
    title: siteConfig.catalog.halfDay.title,
    tagline: siteConfig.catalog.halfDay.durationLabel,
    description: "5-hour private captained charter. Add upgrades a la carte at checkout.",
    includes: [
      "5-hour private charter",
      "Morning or afternoon departure",
      "Captain & mate",
      "Standard inclusions as listed at checkout",
    ],
    fromPriceLabel: `From ${formatUsdFromCents(nastyHalf)}`,
    charterOptions: [
      { experienceSlug: "pontoon", durationHours: 5, label: `${siteConfig.catalog.halfDay.title} · ${siteConfig.catalog.halfDay.durationLabel}` },
    ],
    defaultOptionIndex: 0,
    addonCatalogKeys: [],
    ctaLabel: siteConfig.catalog.halfDay.ctaLabel,
  },
  {
    id: "nastier",
    title: siteConfig.catalog.fullDay.title,
    tagline: siteConfig.catalog.fullDay.durationLabel,
    description: "8-hour private captained charter. Same boat. Add upgrades a la carte at checkout.",
    includes: [
      "8-hour private charter",
      "Optional paid extensions when offered",
      "Captain & mate",
      "Standard inclusions as listed at checkout",
    ],
    fromPriceLabel: `From ${formatUsdFromCents(nastyFull)}`,
    charterOptions: [
      { experienceSlug: "watersports", durationHours: 8, label: `${siteConfig.catalog.fullDay.title} · ${siteConfig.catalog.fullDay.durationLabel}` },
    ],
    defaultOptionIndex: 0,
    addonCatalogKeys: [],
    ctaLabel: siteConfig.catalog.fullDay.ctaLabel,
  },
  {
    id: "nastiest",
    title: siteConfig.catalog.allIn.title,
    tagline: "Full Day All-In",
    description: "Full Day charter with popular add-ons preselected. Optional paid extensions when offered.",
    includes: [
      "8-hour private charter",
      "Optional paid extensions when offered",
      "Popular add-ons preselected at checkout",
    ],
    fromPriceLabel: `From ${formatUsdFromCents(nastiestFrom)}+`,
    charterOptions: [
      { experienceSlug: "watersports", durationHours: 8, label: `${siteConfig.catalog.fullDay.title} · All-In` },
    ],
    defaultOptionIndex: 0,
    addonCatalogKeys: [...NASTIEST_ADDONS],
    recommended: true,
    ctaLabel: siteConfig.catalog.allIn.ctaLabel,
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
