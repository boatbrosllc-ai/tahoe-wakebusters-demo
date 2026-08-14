/**
 * Experience packages — display titles come from siteConfig.catalog.
 * Firestore slugs remain `pontoon` / `watersports` (document identity).
 * Public URL aliases remain in lib/booking/experience-ids.ts.
 */

import { siteConfig } from "@/config/site";
import {
  CHARTER_INCLUDED,
  FOUNDING_ANGLER_RATE_ACTIVE,
  FOUNDING_ANGLER_LABEL,
  formatUsdFromCents,
  getActiveCatalogRateCents,
  STANDARD_RATE_CENTS,
} from "@/content/catalog-pricing";

export interface Experience {
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  highlights: string[];
  duration: string;
  durationMinutes?: number;
  capacity: string;
  heroImage: string;
  /** From admin: CSS object-position for card thumbnails. */
  listingCardImagePosition?: string;
  gallery: string[];
  pricingNote: string;
  /** Optional: lowest price in cents for "From $X" on cards. Use null when pricing is only from live API. */
  fromPriceCents?: number | null;
  faqs?: { q: string; a: string }[];
  ctaLabel?: string;
  badge?: string;
}

const halfCents = getActiveCatalogRateCents("half");
const fullCents = getActiveCatalogRateCents("full");

export const experiences: Experience[] = [
  {
    slug: "pontoon",
    title: siteConfig.catalog.halfDay.title,
    shortDescription: `5 hours · Private captained charter.`,
    description:
      "Private captained charter with captain and mate. Inclusions are listed on the trip page and confirmed at checkout.",
    highlights: CHARTER_INCLUDED.slice(0, 6),
    duration: "5 hours",
    durationMinutes: 300,
    capacity: "Up to 6",
    heroImage: siteConfig.media.welcome,
    gallery: [
      siteConfig.media.welcome,
      "/photos/stock/charter/anglers-on-boat-pexels.jpg",
      siteConfig.media.galleryFallback,
      siteConfig.media.hero,
    ],
    pricingNote: FOUNDING_ANGLER_RATE_ACTIVE
      ? `${FOUNDING_ANGLER_LABEL}: ${formatUsdFromCents(halfCents)} before tax (standard ${formatUsdFromCents(STANDARD_RATE_CENTS.half)}).`
      : `${formatUsdFromCents(halfCents)} before tax. Morning and afternoon departures.`,
    fromPriceCents: halfCents,
    ctaLabel: "BOOK HALF DAY",
    faqs: [
      { q: "Is a captain included?", a: "Yes. Every trip includes a licensed captain and mate." },
      { q: "What should we bring?", a: "Sunscreen, sunglasses, hat, soft-soled shoes. Specific inclusions are listed when you book." },
    ],
  },
  {
    slug: "watersports",
    title: siteConfig.catalog.fullDay.title,
    shortDescription: "8 hours · Private captained charter — most popular.",
    description:
      "Full-day private captained charter. Same inclusions as Half Day with more time on the water.",
    highlights: CHARTER_INCLUDED.slice(0, 6),
    duration: "8 hours",
    durationMinutes: 480,
    capacity: "Up to 6",
    heroImage: siteConfig.media.boats,
    gallery: [
      siteConfig.media.boats,
      siteConfig.media.hero,
      "/photos/stock/charter/anglers-on-boat-pexels.jpg",
      siteConfig.media.galleryFallback,
    ],
    pricingNote: FOUNDING_ANGLER_RATE_ACTIVE
      ? `${FOUNDING_ANGLER_LABEL}: ${formatUsdFromCents(fullCents)} before tax (standard ${formatUsdFromCents(STANDARD_RATE_CENTS.full)}). Peak dates from ${formatUsdFromCents(239_500)}.`
      : `${formatUsdFromCents(fullCents)} before tax. Peak / tournament dates priced higher.`,
    fromPriceCents: fullCents,
    ctaLabel: "BOOK FULL DAY",
    badge: "MOST POPULAR",
    faqs: [
      { q: "How far do we go?", a: "Depends on conditions and the trip length you book. Full-day trips give more range." },
    ],
  },
];

export function getExperienceBySlug(slug: string): Experience | undefined {
  const s = (slug ?? "").toLowerCase().trim();
  if (!s) return undefined;
  if (s === "pontoon" || s === "nasty-half-day" || s === "half-day") {
    return experiences.find((e) => e.slug === "pontoon");
  }
  if (s === "watersports" || s === "nasty-full-day" || s === "full-day") {
    return experiences.find((e) => e.slug === "watersports");
  }
  return experiences.find((e) => e.slug === s);
}

/**
 * Format "from" price for display by experience slug or pricingType.
 * Charter packages: "From $X". Ticketed leftovers: per-ticket wording.
 */
export function formatExperiencePriceLabel(
  slug: string | null | undefined,
  fromPriceCents: number | null | undefined,
  pricingType?: "charter" | "ticketed"
): string {
  if (fromPriceCents == null || !Number.isFinite(fromPriceCents)) return "See dates for pricing";
  const price = (fromPriceCents / 100).toFixed(0);
  if (pricingType === "ticketed") return `From $${price} per ticket`;
  if (/holiday/i.test(slug ?? "")) return `$${price} per ticket`;
  if (/sunset/i.test(slug ?? "")) return `From $${price} per ticket`;
  return `From $${price}`;
}
