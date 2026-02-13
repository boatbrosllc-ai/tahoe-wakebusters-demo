/**
 * Experience packages. TODO: Load from CMS.
 * All images from /photos/ (local Boat Bros assets).
 * Only the 4 categories we offer: Pontoon, Watersports, Sunset Cruise, Holiday Tour.
 */

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
  gallery: string[];
  pricingNote: string;
  /** Optional: lowest price in cents for "From $X" on cards. */
  fromPriceCents?: number;
  faqs?: { q: string; a: string }[];
}

export const experiences: Experience[] = [
  {
    slug: "pontoon",
    title: "Pontoon Party",
    shortDescription: "Spacious pontoon for groups. Coolers, Bluetooth, shade.",
    description:
      "Our most popular rental. Roomy pontoon with Bluetooth stereo, built-in cooler, and plenty of shade. Perfect for friends, families, or bachelor/bachelorette groups. Captain included.",
    highlights: ["Bluetooth stereo", "Built-in cooler", "Shade canopy", "Up to 12"],
    duration: "4 or 8 hours",
    durationMinutes: 480,
    capacity: "Up to 12",
    heroImage: "/photos/IMG_3160.webp",
    gallery: ["/photos/IMG_3160.webp", "/photos/IMG_9649.webp", "/photos/IMG_8614%202.webp"],
    pricingNote: "From $399 for 4 hours. 8-hour trips available.",
    fromPriceCents: 39900,
    faqs: [
      { q: "Is a captain included?", a: "Yes. Every charter includes a licensed captain so you can relax and enjoy the day." },
      { q: "Can we bring food and drinks?", a: "Yes. Bring your own cooler and drinks. Glass is not allowed on the boat." },
    ],
  },
  {
    slug: "watersports",
    title: "Wake & Surf",
    shortDescription: "Tow boats for wakeboarding, surfing, and tubing.",
    description:
      "Purpose-built tow boats for wakeboarding, wakesurfing, and tubing. Experienced drivers available. Great for thrill-seekers and families who want action on the water.",
    highlights: ["Wakeboard & surf gear", "Experienced driver available", "Tubes included", "Up to 8"],
    duration: "2 or 4 hours",
    durationMinutes: 240,
    capacity: "Up to 8",
    heroImage: "/photos/Thomas_2.14.1.webp",
    gallery: ["/photos/Thomas_2.14.1.webp", "/photos/DSC00513%20(3).webp", "/photos/DSC00539.webp"],
    pricingNote: "From $299 for 2 hours. Driver add-on recommended for first-timers.",
    fromPriceCents: 29900,
    faqs: [
      { q: "Is equipment included?", a: "Yes. Wakeboards, surf board, and tubes are included. Life vests in all sizes provided." },
    ],
  },
  {
    slug: "sunset",
    title: "Sunset Cruise",
    shortDescription: "Chill evening cruise. Best views and golden hour.",
    description:
      "Evening cruise timed for sunset over Lake Austin. Relaxed pace, great for couples or small groups. Bring a bottle and enjoy the view.",
    highlights: ["Sunset timing", "Chill vibe", "Up to 6 guests", "2-hour cruise"],
    duration: "2 hours",
    durationMinutes: 120,
    capacity: "Up to 6",
    heroImage: "/photos/IMG_9647%202.webp",
    gallery: ["/photos/IMG_9647%202.webp", "/photos/DSC09319%20(4).webp", "/photos/DSC09321%20(2).webp"],
    pricingNote: "From $249 for 2 hours.",
    fromPriceCents: 24900,
    faqs: [],
  },
  {
    slug: "holiday",
    title: "Holiday Tour",
    shortDescription: "Seasonal holiday lights and festive cruises.",
    description:
      "Seasonal holiday experience: festive lights, hot cocoa, and a relaxed cruise. Available during the holiday season. Perfect for families and small groups.",
    highlights: ["Holiday décor", "Hot cocoa", "Captain included", "Up to 10"],
    duration: "4 hours",
    durationMinutes: 240,
    capacity: "Up to 10",
    heroImage: "/photos/DSC09399%20(2).webp",
    gallery: ["/photos/IMG_5095.webp", "/photos/IMG_5285.webp"],
    pricingNote: "Seasonal pricing. Available November – January.",
    fromPriceCents: 45000,
    faqs: [{ q: "When is the Holiday Tour available?", a: "Typically November through early January. Dates are shown when you select a slot." }],
  },
];

export function getExperienceBySlug(slug: string): Experience | undefined {
  return experiences.find((e) => e.slug === slug);
}
