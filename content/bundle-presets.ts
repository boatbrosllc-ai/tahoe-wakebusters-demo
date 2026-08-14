/**
 * Marketing packages (Half Day / Full Day / All-In).
 *
 * Bundle IDs are checkout keys. Canonical ids are generic; legacy Nasty ids
 * still resolve in `isNsfHalfDayBundle` / `isNsfFullDayBundle` for old links.
 */

import { siteConfig } from "@/config/site";
import {
  FOUNDING_ANGLER_RATE_ACTIVE,
  formatUsdFromCents,
  getActiveCatalogRateCents,
  STANDARD_RATE_CENTS,
} from "@/content/catalog-pricing";

export type BundleId = "half-day" | "full-day" | "all-in";

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
  includes: string[];
  fromPriceLabel: string;
  charterOptions: BundleCharterOption[];
  defaultOptionIndex: number;
  addonCatalogKeys: string[];
  badge?: string;
  ctaLabel: string;
  recommended?: boolean;
};

const ADDON_DISPLAY_CENTS: Record<string, number> = {
  "cooler-ice": 15_00,
  "photo-package": 49_00,
};

function sumAddonDisplay(keys: string[]): number {
  return keys.reduce((sum, k) => sum + (ADDON_DISPLAY_CENTS[k] ?? 0), 0);
}

const halfCents = getActiveCatalogRateCents("half");
const fullCents = getActiveCatalogRateCents("full");

const ALL_IN_ADDONS = ["cooler-ice", "photo-package"] as const;

const allInFrom = fullCents + sumAddonDisplay([...ALL_IN_ADDONS]);

export const bundlePresets: BundlePreset[] = [
  {
    id: "half-day",
    title: siteConfig.catalog.halfDay.title,
    tagline: siteConfig.catalog.halfDay.durationLabel,
    description: "5-hour private captained charter. Add upgrades a la carte at checkout.",
    includes: [
      "5-hour private charter",
      "Morning or afternoon departure",
      "Captain & crew",
      "Standard inclusions as listed at checkout",
    ],
    fromPriceLabel: `From ${formatUsdFromCents(halfCents)}`,
    charterOptions: [
      { experienceSlug: "pontoon", durationHours: 5, label: `${siteConfig.catalog.halfDay.title} · ${siteConfig.catalog.halfDay.durationLabel}` },
    ],
    defaultOptionIndex: 0,
    addonCatalogKeys: [],
    ctaLabel: siteConfig.catalog.halfDay.ctaLabel,
  },
  {
    id: "full-day",
    title: siteConfig.catalog.fullDay.title,
    tagline: siteConfig.catalog.fullDay.durationLabel,
    description: "8-hour private captained charter. Same boat. Add upgrades a la carte at checkout.",
    includes: [
      "8-hour private charter",
      "Optional paid extensions when offered",
      "Captain & crew",
      "Standard inclusions as listed at checkout",
    ],
    fromPriceLabel: `From ${formatUsdFromCents(fullCents)}`,
    charterOptions: [
      { experienceSlug: "watersports", durationHours: 8, label: `${siteConfig.catalog.fullDay.title} · ${siteConfig.catalog.fullDay.durationLabel}` },
    ],
    defaultOptionIndex: 0,
    addonCatalogKeys: [],
    ctaLabel: siteConfig.catalog.fullDay.ctaLabel,
  },
  {
    id: "all-in",
    title: siteConfig.catalog.allIn.title,
    tagline: "Full Day All-In",
    description: "Full Day charter with popular add-ons preselected. Optional paid extensions when offered.",
    includes: [
      "8-hour private charter",
      "Optional paid extensions when offered",
      "Popular add-ons preselected at checkout",
    ],
    fromPriceLabel: `From ${formatUsdFromCents(allInFrom)}+`,
    charterOptions: [
      { experienceSlug: "watersports", durationHours: 8, label: `${siteConfig.catalog.fullDay.title} · All-In` },
    ],
    defaultOptionIndex: 0,
    addonCatalogKeys: [...ALL_IN_ADDONS],
    recommended: true,
    ctaLabel: siteConfig.catalog.allIn.ctaLabel,
  },
];

export function getBundlePreset(id: string): BundlePreset | undefined {
  if (id === "nasty") return bundlePresets.find((b) => b.id === "half-day");
  if (id === "nastier") return bundlePresets.find((b) => b.id === "full-day");
  if (id === "nastiest") return bundlePresets.find((b) => b.id === "all-in");
  return bundlePresets.find((b) => b.id === id);
}

export function foundingRateCallout(): string | null {
  if (!FOUNDING_ANGLER_RATE_ACTIVE) return null;
  return `Launch rates active — Half Day ${formatUsdFromCents(getActiveCatalogRateCents("half"))} / Full Day ${formatUsdFromCents(getActiveCatalogRateCents("full"))} (standard ${formatUsdFromCents(STANDARD_RATE_CENTS.half)} / ${formatUsdFromCents(STANDARD_RATE_CENTS.full)}).`;
}
