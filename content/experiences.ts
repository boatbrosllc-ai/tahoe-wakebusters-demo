/**
 * Experience packages. TODO: Load from CMS.
 * All images from /photos/ (local Boat Bros assets).
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
  faqs?: { q: string; a: string }[];
}

export const experiences: Experience[] = [
  {
    slug: "pontoon-party",
    title: "Pontoon Party",
    shortDescription: "Spacious pontoon for groups. Coolers, Bluetooth, shade.",
    description:
      "Our most popular rental. Roomy pontoon with Bluetooth stereo, built-in cooler, and plenty of shade. Perfect for friends, families, or bachelor/bachelorette groups. Captain optional.",
    highlights: ["Bluetooth stereo", "Built-in cooler", "Shade canopy", "Captain optional", "Up to 12 guests"],
    duration: "4 or 8 hours",
    durationMinutes: 480,
    capacity: "Up to 12",
    heroImage: "/photos/DSC00427.webp",
    gallery: ["/photos/DSC00452.webp", "/photos/DSC00456.webp", "/photos/DSC00461.webp"],
    pricingNote: "From $399 for 4 hours. 8-hour and captain add-ons available.",
    faqs: [
      { q: "Do we need a captain?", a: "No. You can self-drive with a valid ID and brief orientation. We offer licensed captains for an extra fee." },
      { q: "Can we bring food and drinks?", a: "Yes. Bring your own cooler and drinks. Glass is not allowed on the boat." },
    ],
  },
  {
    slug: "wake-surf",
    title: "Wake & Surf",
    shortDescription: "Tow boats for wakeboarding, surfing, and tubing.",
    description:
      "Purpose-built tow boats for wakeboarding, wakesurfing, and tubing. Experienced drivers available. Great for thrill-seekers and families who want action on the water.",
    highlights: ["Wakeboard & surf gear", "Experienced driver available", "Tubes included", "Up to 8 guests"],
    duration: "2 or 4 hours",
    durationMinutes: 240,
    capacity: "Up to 8",
    heroImage: "/photos/DSC00462.webp",
    gallery: ["/photos/DSC00484.webp", "/photos/DSC00513.webp"],
    pricingNote: "From $299 for 2 hours. Driver add-on recommended for first-timers.",
    faqs: [
      { q: "Is equipment included?", a: "Yes. Wakeboards, surf board, and tubes are included. Life vests in all sizes provided." },
    ],
  },
  {
    slug: "sunset-cruise",
    title: "Sunset Cruise",
    shortDescription: "Chill evening cruise. Best views and golden hour.",
    description:
      "Evening cruise timed for sunset over Lake Travis. Relaxed pace, great for couples or small groups. Bring a bottle and enjoy the view.",
    highlights: ["Sunset timing", "Chill vibe", "Up to 6 guests", "2-hour cruise"],
    duration: "2 hours",
    durationMinutes: 120,
    capacity: "Up to 6",
    heroImage: "/photos/DSC09255.webp",
    gallery: ["/photos/DSC09270.webp", "/photos/DSC09285.webp"],
    pricingNote: "From $249 for 2 hours.",
    faqs: [],
  },
  {
    slug: "family-day",
    title: "Family Day",
    shortDescription: "Safe, fun setup for kids and parents. Tubes and swimming.",
    description:
      "Family-focused rental with calm coves, tubing, and swimming. Life vests for all ages. Captain option for parents who want to relax.",
    highlights: ["Kid-friendly", "Life vests all sizes", "Calm coves", "Captain available", "Up to 10"],
    duration: "4 hours",
    durationMinutes: 240,
    capacity: "Up to 10",
    heroImage: "/photos/DSC00539.webp",
    gallery: ["/photos/DSC00544.webp", "/photos/DSC00597.webp"],
    pricingNote: "From $349 for 4 hours. Captain add-on popular for families.",
    faqs: [],
  },
  {
    slug: "corporate",
    title: "Corporate Outing",
    shortDescription: "Team building and client entertainment on the water.",
    description:
      "Professional setup for corporate groups: multiple boats, catering options, and flexible timing. We handle logistics so you can focus on your team.",
    highlights: ["Multi-boat options", "Catering available", "Flexible timing", "Dedicated contact"],
    duration: "4–8 hours",
    durationMinutes: 480,
    capacity: "10–40+",
    heroImage: "/photos/DSC09354.webp",
    gallery: ["/photos/DSC09378.webp", "/photos/DSC09423.webp"],
    pricingNote: "Custom quote. Contact us for group pricing.",
    faqs: [],
  },
  {
    slug: "bachelor-bachelorette",
    title: "Bachelor / Bachelorette",
    shortDescription: "Party boats and captains for your crew.",
    description:
      "Make the day unforgettable. Pontoon or tow boat, decorations available, and a captain so the whole group can party. Popular for Austin bachelor and bachelorette parties.",
    highlights: ["Party-ready boats", "Captain included option", "Decor add-ons", "Up to 14"],
    duration: "4 or 6 hours",
    durationMinutes: 360,
    capacity: "Up to 14",
    heroImage: "/photos/DSC09207.webp",
    gallery: ["/photos/DSC09230.webp", "/photos/DSC09454.webp"],
    pricingNote: "From $499 for 4 hours with captain. Decor and longer trips available.",
    faqs: [],
  },
];

export function getExperienceBySlug(slug: string): Experience | undefined {
  return experiences.find((e) => e.slug === slug);
}
