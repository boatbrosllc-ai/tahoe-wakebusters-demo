import { brand } from "@/content/brand";
/**
 * High-ticket multi-day packages — inquiry / marketing only.
 * Do NOT seed these as Firestore charter experiences or boat inventory.
 */

export type InquiryPackage = {
  id: string;
  title: string;
  guests: string;
  nights: string;
  fishingDays: string;
  boats?: string;
  fromPriceLabel: string;
  description: string;
  includesHint: string;
  /** Marketing photo for package card */
  image: string;
  imageAlt: string;
  /** CSS object-position for cover crop (portrait photos often need top bias). */
  imagePosition?: string;
  /** Short punch line under the title */
  hook: string;
  highlights: string[];
};

export const inquiryPackages: InquiryPackage[] = [
  {
    id: "bachelor-blowout",
    title: "Bachelor Blowout",
    guests: "6–8 guests",
    nights: "3 nights",
    fishingDays: "2 fishing days",
    fromPriceLabel: "Starting at $14,500",
    hook: "The crew trip that actually fishes.",
    description:
      "A private bachelor itinerary with captained days on the water, lodging coordination, and group logistics.",
    includesHint:
      "Fishing days, villa coordination, transportation, food/provisioning guidance, catch handling, group coordination.",
    image: brand.media.welcome,
    imageAlt: "Guests on a private boat rental",
    imagePosition: "58% 18%",
    highlights: [
      "2 private fishing days",
      "Villa coordination",
      "Group transport planning",
      "Catch handling support",
    ],
  },
  {
    id: "corporate-retreat",
    title: "Corporate Retreat",
    guests: "8–12 guests",
    nights: "3 nights",
    fishingDays: "2 fishing days",
    boats: "2 boats",
    fromPriceLabel: "Starting at $22,000",
    hook: "Two boats. One polished Cabo base.",
    description:
      "Team retreat built around dual-boat fishing days, shared meals, and a polished Cabo base of operations.",
    includesHint:
      "Multi-boat fishing, villa coordination, transportation, provisioning, catch handling, on-ground coordination.",
    image: brand.media.welcome,
    imageAlt: "Boats at the dock",
    highlights: [
      "Dual-boat fishing days",
      "Shared meal planning",
      "Villa + transport partners",
      "On-ground coordination",
    ],
  },
  {
    id: "nasty-cabo-week",
    title: "Charter Week",
    guests: "8 guests",
    nights: "5 nights",
    fishingDays: "4 fishing days",
    fromPriceLabel: "Starting at $29,800",
    hook: "More days on the water. One coordinated week.",
    description:
      "A full week of Cabo fishing and downtime — more days on the water, one coordinated package.",
    includesHint: "Four fishing days, villa coordination, transportation, food/provisioning, catch handling.",
    image: brand.media.hero,
    imageAlt: "Charter boat at sunset",
    highlights: [
      "4 fishing days",
      "5 nights coordinated",
      "Downtime built in",
      "Catch-to-table support",
    ],
  },
  {
    id: "nasty-tournament-week",
    title: "Tournament Week",
    guests: "Custom group",
    nights: "Flexible nights",
    fishingDays: "Flexible boat days",
    fromPriceLabel: "Custom / quote",
    hook: "Peak dates. Flexible boat days. Built around the bite.",
    description:
      "Tournament-week planning with flexible boat days, peak-date strategy, and partner logistics.",
    includesHint:
      "Custom fishing plan, lodging partners, transport, provisioning, catch handling — quoted per group.",
    image: brand.media.boats,
    imageAlt: "Boat on the water at sunset",
    highlights: [
      "Custom boat-day plan",
      "Peak-date strategy",
      "Lodging partners",
      "Quoted per group",
    ],
  },
];

export const INQUIRY_PARTNER_DISCLAIMER =
  `Villa, transportation, meals, and other third-party services are coordinated by ${brand.companyName} and fulfilled by vetted local partners. These packages are inquiry-only — we do not auto-reserve multi-day boat or villa inventory online.`;

export const PACKAGE_QUOTE_STEPS = [
  {
    title: "Tell us the trip",
    body: "Pick a package shape — bachelor, corporate, week-long, or tournament — and share dates, headcount, and must-haves.",
  },
  {
    title: "We build the quote",
    body: "Nasty coordinates fishing days plus vetted partners for lodging, transport, and provisioning around your group.",
  },
  {
    title: "Confirm & arrive",
    body: "Once you approve the quote, we lock the plan and send marina check-in details before you land in Cabo.",
  },
] as const;
