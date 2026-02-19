/**
 * Placeholder data for Lake Austin Pontoon premium listing page.
 * No backend — frontend UX only.
 */

export const HERO = {
  title: "Lake Austin Pontoon Rental Experience",
  subtitle: "Captain included. Premium sound. Chill, swim, celebrate.",
  /** SEO intro for hero (Lake Austin pontoon rentals, captained, Austin TX). */
  introParagraph:
    "Our Lake Austin pontoon rentals are captained pontoon rental experiences in Austin, TX. No boating license required—relax with your group while a licensed captain runs the boat. Book your Lake Austin pontoon rental below.",
  primaryCta: "Check Availability",
  secondaryCta: "View Gallery",
  /** Hero image — local pontoon photo (same as pontoon experience in content/experiences). */
  imageFallback: "/photos/pontoon-hero-fallback.jpg",
  unsplashFallback: "/photos/DSC09399%20(2).webp",
};

export const BOOKING_PREVIEW = {
  durations: [2, 4, 6, 8] as const,
  minGuests: 1,
  maxGuests: 14,
  trustLine: "Instant confirmation • No hidden fees",
};

/** Starting price by duration (hours) — UI only. */
export const PRICING_MAP: Record<number, number> = {
  2: 450,
  4: 450,
  6: 899,
  8: 1099,
};

export const SOCIAL_PROOF = [
  { label: "★ 5.0", sub: "rating" },
  { label: "273+", sub: "Google reviews" },
  { label: "Top-rated", sub: "on Lake Austin" },
  { label: "Captain-led", sub: "" },
  { label: "Free lily pad", sub: "" },
  { label: "Cooler Included", sub: "" },
];
export const SOCIAL_AVATARS = [
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&h=80&fit=crop&crop=face",
];
export const SOCIAL_LINE = "Loved by locals & visitors";

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
    "Spend the day on a premium pontoon with a dedicated captain. Cruise Lake Austin, anchor at a party cove, swim off the giant lily pad, and enjoy premium sound. Everything’s included — you just show up.",
  /** SEO-rich paragraphs for the experience section (things to do, where captains go, lunch, etc.). */
  seoParagraphs: [
    "On a Lake Austin pontoon rental you can swim, float on the lily pad, play music on our Bluetooth system, and anchor in popular coves. Many groups bring games, snacks, and drinks in a cooler—we provide the cooler and ice so you can pack lunch and beverages (no glass). Our captained pontoon rentals are ideal for birthdays, bachelorette parties, and family days on the water in Austin, TX.",
    "Your captain knows Lake Austin and can take you to Party Cove, quieter inlets, and scenic spots along the shoreline. You don’t need a boating license; the captain handles docking, navigation, and safety so you can relax. Life jackets are on board, and we include fuel, so the price you see is what you pay for the experience.",
    "Plan lunch your way: pack a cooler with sandwiches and drinks (we include the cooler and ice), or time your trip around a stop if you’d like. Lake Austin has calm water and easy access from Austin—perfect for a half-day or full-day pontoon rental. Book your Lake Austin pontoon experience below and we’ll take care of the rest.",
  ],
  features: [
    { icon: "captain", text: "Private captain included" },
    { icon: "sound", text: "Premium Bluetooth sound system" },
    { icon: "lily", text: "Giant floating lily pad" },
    { icon: "cooler", text: "Cooler. Ice included." },
    { icon: "fuel", text: "Fuel included" },
    { icon: "sparkles", text: "Good vibes" },
  ],
  timeline: [
    { step: "Dock", desc: "Meet your captain" },
    { step: "Cruise", desc: "Scenic Lake Austin" },
    { step: "Party cove", desc: "Anchor & hang" },
    { step: "Swim", desc: "Lily pad & water" },
    { step: "Sunset", desc: "Golden hour return" },
  ],
  imageUrl: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=80",
};

export const GALLERY_IMAGES = [
  {
    url: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=1200&q=85",
    alt: "Pontoon on Lake Austin",
    category: "Boat",
  },
  {
    url: "https://images.unsplash.com/photo-1567894340315-735d7c361db0?w=800&q=85",
    alt: "Lake day vibes",
    category: "Lake Days",
  },
  {
    url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=85",
    alt: "Sunset on the water",
    category: "Sunset",
  },
  {
    url: "https://images.unsplash.com/photo-1519046904884-53103b34b206?w=800&q=85",
    alt: "Group on boat",
    category: "Vibes",
  },
  {
    url: "https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=800&q=85",
    alt: "Swimming and fun",
    category: "Vibes",
  },
];
export const GALLERY_CATEGORIES = ["Vibes", "Boat", "Lake Days", "Sunset"] as const;

export const INCLUDED_ITEMS = [
  { icon: "captain", title: "Licensed captain", desc: "Your captain handles everything." },
  { icon: "fuel", title: "Fuel included", desc: "No surprise fuel fees." },
  { icon: "cooler", title: "Cooler", desc: "Ice included." },
  { icon: "sound", title: "Premium sound", desc: "Bluetooth stereo on board." },
  { icon: "lily", title: "Lily pad", desc: "Giant floating mat for swimming." },
  { icon: "lifejacket", title: "Life jackets", desc: "USCG-approved for all ages." },
  { icon: "safety", title: "Safety first", desc: "Captain-trained; life jackets + brief." },
  { icon: "sparkles", title: "Good vibes", desc: "Chill atmosphere, great music, and memories." },
];

export const PRICING = {
  note: "Deposit due today. Balance due 48 hours before your trip.",
  tipNote: "Tips for your captain are not included but appreciated.",
  guarantee: "Weather flexibility — we'll work with you.",
  popularHours: 4,
};

export const REVIEWS = [
  {
    name: "Sarah M.",
    location: "Austin, TX",
    rating: 5,
    text: "Best day on the water. Captain was amazing, boat was spotless, and the lily pad was a hit with the kids. Already booking again.",
    date: "Jan 2025",
    featured: true,
    avatar: null,
  },
  {
    name: "James K.",
    location: "Dallas, TX",
    rating: 5,
    text: "Smooth from start to finish. Great sound system, plenty of space. Lake Austin at sunset — unbeatable.",
    date: "Dec 2024",
    featured: false,
    avatar: null,
  },
  {
    name: "Elena R.",
    location: "Houston, TX",
    rating: 5,
    text: "We did the 6-hour and it flew by. Professional, fun, and the boat was in perfect condition.",
    date: "Dec 2024",
    featured: false,
    avatar: null,
  },
  {
    name: "Mike T.",
    location: "Austin, TX",
    rating: 5,
    text: "Third time with Boat Bros. Consistent quality and the team always makes it special.",
    date: "Nov 2024",
    featured: false,
    avatar: null,
  },
  {
    name: "Jessica L.",
    location: "San Antonio, TX",
    rating: 5,
    text: "Birthday surprise for my husband — he was blown away. Couldn't recommend more.",
    date: "Nov 2024",
    featured: false,
    avatar: null,
  },
  {
    name: "David P.",
    location: "Austin, TX",
    rating: 5,
    text: "Chill vibes, pro captain, great boat. Exactly what we wanted for a low-key Saturday.",
    date: "Oct 2024",
    featured: false,
    avatar: null,
  },
];

export const FAQ_ITEMS = [
  {
    question: "What's included?",
    answer:
      "Your rental includes a licensed captain, fuel, cooler (ice included), premium Bluetooth sound system, and a giant floating lily pad. Life jackets are on board for all guests.",
  },
  {
    question: "Can we bring drinks?",
    answer:
      "Yes. You may bring your own drinks and snacks. Glass is not allowed on the boat; please use cans or plastic. We provide ice.",
  },
  {
    question: "Where do we meet?",
    answer:
      "We'll send you the exact dock and parking details after booking. Most trips launch from a marina on Lake Austin with easy parking.",
  },
  {
    question: "How many people?",
    answer:
      "Our pontoon can accommodate up to 14 guests. For larger groups, we can discuss multiple boats.",
  },
  {
    question: "What if weather is bad?",
    answer:
      "We keep an eye on the forecast and will work with you to reschedule if conditions aren't safe or fun. Weather flexibility — we'll work with you.",
  },
  {
    question: "Is music allowed?",
    answer:
      "Yes. We have a premium Bluetooth sound system on board. Keep volume respectful near shore and other boats.",
  },
  {
    question: "Cancellation policy",
    answer:
      "Cancel or reschedule at least 48 hours before your trip for a full refund of your deposit. Within 48 hours, deposits are non-refundable but we can help reschedule when possible.",
  },
];

export const FINAL_CTA = {
  headline: "Ready for the best day on Lake Austin?",
  primaryCta: "Check Availability",
  secondaryCta: "Text us",
  secondaryHref: "#",
};
