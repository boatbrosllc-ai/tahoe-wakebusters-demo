/**
 * Fleet packages for Tahoe Wakebusters demo.
 * Firestore slugs remain `pontoon` / `watersports` for seed compatibility.
 */

import { siteConfig } from "@/config/site";
import {
  formatUsdFromCents,
  getActiveCatalogRateCents,
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
  listingCardImagePosition?: string;
  gallery: string[];
  pricingNote: string;
  fromPriceCents?: number | null;
  faqs?: { q: string; a: string }[];
  ctaLabel?: string;
  bookCtaLabel?: string;
  badge?: string;
  imageAlt?: string;
}

const partyHalf = getActiveCatalogRateCents("half");
const partyFull = getActiveCatalogRateCents("full");

export const experiences: Experience[] = [
  {
    slug: "pontoon",
    title: siteConfig.catalog.halfDay.title,
    shortDescription:
      "The double decker that made us famous. Two waterslides off the top deck, a full BBQ grill, and enough room for the whole crew to spread out. This is the boat people book for 4th of July, bachelorette parties, and birthdays they'll still be talking about in five years.",
    description:
      "The double decker that made us famous. Two waterslides off the top deck, a full BBQ grill, and enough room for the whole crew to spread out. This is the boat people book for 4th of July, bachelorette parties, and birthdays they'll still be talking about in five years. Full tank of gas, water toys, coolers, and safety gear included. Captain required — captain fees paid separately.",
    highlights: [
      "Full tank of gas included",
      "Dual waterslides & top deck",
      "BBQ grill & coolers",
      "Water toys, floaties & tubes",
      "Premium Bluetooth stereo",
      "Life jackets & safety gear",
    ],
    duration: "4 or 8 hours",
    durationMinutes: 240,
    capacity: "Up to 13 guests",
    heroImage: "/photos/wakebusters/party-barge.jpg",
    gallery: [
      "/photos/wakebusters/party-barge.jpg",
      "/photos/wakebusters/hero-slides.jpg",
      "/photos/wakebusters/party-crew.jpg",
      "/photos/wakebusters/wedding.jpg",
    ],
    pricingNote: `Half day (4 hrs) from ${formatUsdFromCents(partyHalf)} · Full day (8 hrs) from ${formatUsdFromCents(partyFull)}. Captain fees paid separately.`,
    fromPriceCents: partyHalf,
    ctaLabel: "BOOK PARTY BARGE",
    bookCtaLabel: "Book now",
    badge: "Most Popular",
    imageAlt: "Double decker party barge rental with waterslides on Lake Tahoe",
    faqs: [
      {
        q: "Do I need a captain?",
        a: "Yes. Every charter runs with a USCG-certified captain. Captain fees are quoted separately and confirmed before you book.",
      },
      {
        q: "Is gas included?",
        a: "Yes — every rental includes a full tank of gas. No surprise fuel charges at checkout.",
      },
    ],
  },
  {
    slug: "watersports",
    title: siteConfig.catalog.fullDay.title,
    shortDescription:
      "A Mastercraft NXT built to throw a clean wake, loaded with boards for every skill level. Whether you've surfed a hundred sessions or you're standing up for the first time, our captains put you in the right spot on the lake and coach you into the wave.",
    description:
      "A Mastercraft NXT built to throw a clean wake, loaded with boards for every skill level. Whether you've surfed a hundred sessions or you're standing up for the first time, our captains put you in the right spot on the lake and coach you into the wave. Full tank of gas included. Captain required — captain fees paid separately.",
    highlights: [
      "Mastercraft NXT wakesurf boat",
      "Multiple wakesurf boards & wakeboards",
      "Skis and tubes included",
      "Full tank of gas",
      "Life jackets & safety gear",
    ],
    duration: "2–8 hours",
    durationMinutes: 120,
    capacity: "Up to 10 guests",
    heroImage: "/photos/wakebusters/wakesurf.jpg",
    gallery: [
      "/photos/wakebusters/wakesurf.jpg",
      "/photos/wakebusters/wakesurf-2.jpg",
      "/photos/wakebusters/gallery-2.jpg",
      "/photos/wakebusters/sunset.jpg",
    ],
    pricingNote: "From $800 (2 hrs) · Half day $1,500 · Full day $2,500. Captain fees paid separately.",
    fromPriceCents: 80_000,
    ctaLabel: "BOOK WAKESURF",
    bookCtaLabel: "Book now",
    imageAlt: "Mastercraft NXT wakeboard boat rental on Lake Tahoe",
    faqs: [
      {
        q: "Are boards included?",
        a: "Yes. Wakesurf boards, wakeboards, water skis, and towable tubes are included with the charter.",
      },
    ],
  },
  {
    slug: "sunset",
    title: siteConfig.catalog.allIn.title,
    shortDescription:
      "Our Bennington tritoon is the pontoon boat rental for people who want Lake Tahoe at its most beautiful — Emerald Bay, Sand Harbor, the quiet coves most visitors never find. Comfortable enough for grandparents, quick enough to pull a tube.",
    description:
      "Our Bennington tritoon is the pontoon boat rental for people who want Lake Tahoe at its most beautiful — Emerald Bay, Sand Harbor, the quiet coves most visitors never find. Comfortable enough for grandparents, quick enough to pull a tube. Full tank of gas, water toys, and safety gear included. Captain required — captain fees paid separately.",
    highlights: [
      "Full tank of gas included",
      "Tube & water toys",
      "Coolers & Bluetooth stereo",
      "Comfortable seating for 12",
      "Life jackets & safety gear",
    ],
    duration: "4–8 hours",
    durationMinutes: 240,
    capacity: "Up to 12 guests",
    heroImage: "/photos/wakebusters/tritoon.jpg",
    gallery: [
      "/photos/wakebusters/tritoon.jpg",
      "/photos/wakebusters/tritoon-slide.jpg",
      "/photos/wakebusters/lake.jpg",
      "/photos/wakebusters/sunset.jpg",
    ],
    pricingNote: "Half day from $1,100 · 6 hrs (Mon–Thu) $1,500 · Full day $1,900. Captain fees paid separately.",
    fromPriceCents: 110_000,
    ctaLabel: "BOOK TRITOON",
    bookCtaLabel: "Book now",
    imageAlt: "Luxury Bennington tritoon pontoon boat rental Lake Tahoe",
    faqs: [
      {
        q: "Where do we launch?",
        a: "All rentals depart from Tahoe Keys Marina in South Lake Tahoe. Arrive 20 minutes early for parking and loading.",
      },
    ],
  },
];

export function getExperienceBySlug(slug: string): Experience | undefined {
  const s = (slug ?? "").toLowerCase().trim();
  if (!s) return undefined;
  if (s === "pontoon" || s === "nasty-half-day" || s === "half-day" || s === "party-barge") {
    return experiences.find((e) => e.slug === "pontoon");
  }
  if (s === "watersports" || s === "nasty-full-day" || s === "full-day" || s === "wakesurf") {
    return experiences.find((e) => e.slug === "watersports");
  }
  if (s === "sunset" || s === "tritoon" || s === "all-in") {
    return experiences.find((e) => e.slug === "sunset");
  }
  return experiences.find((e) => e.slug === s);
}

export function getAllExperienceSlugs(): string[] {
  return experiences.map((e) => e.slug);
}

export function formatExperiencePriceLabel(
  slug: string | null | undefined,
  fromPriceCents: number | null | undefined,
  pricingType?: "charter" | "ticketed"
): string {
  if (fromPriceCents == null || !Number.isFinite(fromPriceCents)) return "See dates for pricing";
  const price = (fromPriceCents / 100).toFixed(0);
  if (pricingType === "ticketed") return `From $${price} per ticket`;
  if (/holiday/i.test(slug ?? "")) return `$${price} per ticket`;
  return `From $${price}`;
}
