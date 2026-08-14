import { brand } from "@/content/brand";
import { siteConfig } from "@/config/site";
/**
 * Shared listing-page fallbacks for experience UI components.
 * Prefer Firestore experience overrides when present.
 */

import { location } from "@/content/location";

export const HERO = {
  title: `${siteConfig.catalog.halfDay.title} & ${siteConfig.catalog.fullDay.title}`,
  subtitle: `Captain & crew included. Book your ${siteConfig.catalog.halfDay.title} or ${siteConfig.catalog.fullDay.title}.`,
  introParagraph:
    "Private captained boat rentals. Check availability below.",
  primaryCta: "Check Availability",
  secondaryCta: "View Gallery",
  imageFallback: siteConfig.media.hero,
  unsplashFallback: siteConfig.media.boats,
};

export const BOOKING_PREVIEW = {
  durations: [5, 8] as const,
  minGuests: 1,
  maxGuests: 8,
  trustLine: "Instant confirmation • No hidden processing surcharge",
};

/**
 * Starting price by duration (hours) — static fallback / skeleton only.
 * Authoritative charter rates live in Firestore `experiences/{id}/rates`.
 */
export const PRICING_MAP: Record<number, number> = {
  5: 1500,
  8: 2200,
};

/** Default social strip — no fake star ratings. */
export const SOCIAL_PROOF = [
  { label: "Private", sub: "charter" },
  { label: "Captain", sub: "& crew" },
  { label: location.address.city || "Private", sub: location.address.city ? "" : "charter" },
  ...(location.reviewCount > 0
    ? [
        { label: "★ " + String(location.rating), sub: "rating" },
        { label: `${location.reviewCount}+`, sub: "5-star reviews" },
      ]
    : []),
];

/** Static strip variant (legacy lily-pad filter kept for callers). */
export const SOCIAL_PROOF_WITHOUT_LILY_PAD = SOCIAL_PROOF.filter(
  (item) => !/lily/i.test(`${item.label} ${item.sub}`)
);
export const SOCIAL_AVATARS = [
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop&crop=face",
];
export const SOCIAL_LINE = brand.tagline;

export interface ExperienceOverviewData {
  headline: string;
  story: string;
  seoParagraphs?: string[];
  features: { icon: string; text: string }[];
  timeline: { step: string; desc: string }[];
  imageUrl: string;
}

export const EXPERIENCE_OVERVIEW: ExperienceOverviewData = {
  headline: "The experience",
  story:
    "A private captained charter. Tackle and provisions follow what's listed on the trip — confirm inclusions when you book.",
  seoParagraphs: [
    `${brand.companyName} runs private captained trips. ${siteConfig.catalog.halfDay.title} and ${siteConfig.catalog.fullDay.title} share the same boat inventory — pick your length and check live availability.`,
    "Your crew handles the boat. Exact dock and check-in details arrive in your confirmation after booking.",
  ],
  features: [
    { icon: "captain", text: "Licensed captain & mate" },
    { icon: "tackle", text: "Tackle & bait included" },
    { icon: "license", text: "Licenses arranged" },
    { icon: "cooler", text: "Ice & cooler space" },
  ],
  timeline: [
    { step: "Meet", desc: "Dock / marina" },
    { step: "Brief", desc: "Safety & plan" },
    { step: "Trip", desc: "On the water" },
    { step: "Return", desc: "Back to the dock" },
  ],
  imageUrl: siteConfig.media.hero,
};

export const GALLERY_IMAGES = [
  {
    url: siteConfig.media.hero,
    alt: "View from a boat on the water",
    category: "Water",
  },
  {
    url: siteConfig.media.boats,
    alt: "Charter boat at sunset",
    category: "Sunset",
  },
];
export const GALLERY_CATEGORIES = ["Water", "Sunset"] as const;

export const INCLUDED_ITEMS = [
  { icon: "captain", title: "Licensed captain & mate", desc: "Your crew runs the boat." },
  { icon: "tackle", title: "Tackle & bait", desc: "Included on charter." },
  { icon: "license", title: "Licenses arranged", desc: "Fishing licenses handled." },
  { icon: "cooler", title: "Ice & cooler space", desc: "Bring drinks and food as allowed." },
  { icon: "safety", title: "Safety brief", desc: "Captain-led before departure." },
  { icon: "sparkles", title: "Good vibes", desc: "Private boat for your group." },
];

export const PRICING = {
  note: "Deposit options appear in checkout when the trip date qualifies. Balance rules follow your confirmation.",
  tipNote: "Tips for your captain and mate are not included but appreciated.",
  popularHours: 8,
};

/** Empty until real guest reviews exist — do not invent testimonials. */
export const REVIEWS: {
  name: string;
  location: string;
  rating: number;
  text: string;
  date: string;
  featured: boolean;
  avatar: string | null;
}[] = [];

export const FAQ_ITEMS = [
  {
    question: "What's included?",
    answer:
      "Charters include licensed captain and mate, tackle, bait, and fishing licenses as listed on the experience. Optional add-ons appear in checkout.",
  },
  {
    question: "Where do we meet?",
    answer:
      "Meet at the dock. Exact slip, dock instructions, and check-in time arrive in your confirmation after booking.",
  },
  {
    question: "How many people?",
    answer:
      "Party size limits are shown on each charter listing and enforced in booking. Contact us for larger groups or multi-day packages.",
  },
  {
    question: "What if weather is bad?",
    answer:
      "We monitor conditions and will work with you to reschedule when the day isn't safe or fishable.",
  },
  {
    question: "Cancellation policy",
    answer:
      "Cancellation and deposit rules are shown at checkout and in your confirmation email.",
  },
];

export const FINAL_CTA = {
  headline: "Ready to book?",
  primaryCta: "Check Availability",
  secondaryCta: "Contact us",
  secondaryHref: "/contact",
};
