/**
 * Experience packages — Cabo San Lucas sport fishing charters.
 * Firestore slugs remain `pontoon` / `watersports` (document identity).
 * Public canonical URLs: nasty-half-day / nasty-full-day via experience-aliases.
 */

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
    title: "Nasty Half Day",
    shortDescription: "5 hours · Private Cabo fishing charter.",
    description:
      "Private Cabo fishing charter with captain and mate, premium tackle, live bait allowance, licenses for up to four anglers, water, soft drinks, snacks, light breakfast, crew photos, and local-grounds fuel.",
    highlights: CHARTER_INCLUDED.slice(0, 6),
    duration: "5 hours",
    durationMinutes: 300,
    capacity: "Up to 6",
    heroImage: "/photos/nsf/yellowfin-marina-duo.png",
    gallery: [
      "/photos/nsf/yellowfin-marina-duo.png",
      "/photos/stock/charter/anglers-on-boat-pexels.jpg",
      "/photos/nsf/yellowfin-marina-catch.png",
      "/photos/stock/cabo/el-arco-from-boat-pexels.jpg",
    ],
    pricingNote: FOUNDING_ANGLER_RATE_ACTIVE
      ? `${FOUNDING_ANGLER_LABEL}: ${formatUsdFromCents(halfCents)} before tax (standard ${formatUsdFromCents(STANDARD_RATE_CENTS.half)}).`
      : `${formatUsdFromCents(halfCents)} before tax. Morning and afternoon departures.`,
    fromPriceCents: halfCents,
    ctaLabel: "BOOK HALF DAY",
    faqs: [
      { q: "Is a captain included?", a: "Yes. Every charter includes a licensed captain and mate so you can focus on the fish." },
      { q: "What should we bring?", a: "Sunscreen, sunglasses, hat, soft-soled shoes. We provide tackle, bait, snacks, and the drinks listed in what's included." },
    ],
  },
  {
    slug: "watersports",
    title: "Nasty Full Day",
    shortDescription: "8 hours · Private offshore charter — most popular.",
    description:
      "Full-day private offshore charter for serious time on the grounds. Same inclusions as Half Day with more range when conditions allow.",
    highlights: CHARTER_INCLUDED.slice(0, 6),
    duration: "8 hours",
    durationMinutes: 480,
    capacity: "Up to 6",
    heroImage: "/photos/nsf/yellowfin-ocean-duo.png",
    gallery: [
      "/photos/nsf/yellowfin-ocean-duo.png",
      "/photos/nsf/sailfish-baitball.png",
      "/photos/stock/species/tuna-underwater-bacanek.jpg",
      "/photos/nsf/yellowfin-marina-catch.png",
    ],
    pricingNote: FOUNDING_ANGLER_RATE_ACTIVE
      ? `${FOUNDING_ANGLER_LABEL}: ${formatUsdFromCents(fullCents)} before tax (standard ${formatUsdFromCents(STANDARD_RATE_CENTS.full)}). Peak dates from ${formatUsdFromCents(239_500)}.`
      : `${formatUsdFromCents(fullCents)} before tax. Peak / tournament dates priced higher.`,
    fromPriceCents: fullCents,
    ctaLabel: "BOOK FULL DAY",
    badge: "MOST POPULAR",
    faqs: [
      { q: "How far offshore do we go?", a: "Depends on the bite and conditions. Full-day trips give us range to hit the banks and work multiple spots." },
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
