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
};

export const inquiryPackages: InquiryPackage[] = [
  {
    id: "bachelor-blowout",
    title: "Bachelor Blowout",
    guests: "6–8 guests",
    nights: "3 nights",
    fishingDays: "2 fishing days",
    fromPriceLabel: "Starting at $14,500",
    description:
      "A private Cabo bachelor itinerary with sport fishing days, lodging coordination, and group logistics handled by Nasty.",
    includesHint: "Fishing days, villa coordination, transportation, food/provisioning guidance, catch handling, group coordination.",
  },
  {
    id: "corporate-retreat",
    title: "Corporate Retreat",
    guests: "8–12 guests",
    nights: "3 nights",
    fishingDays: "2 fishing days",
    boats: "2 boats",
    fromPriceLabel: "Starting at $22,000",
    description:
      "Team retreat built around dual-boat fishing days, shared meals, and a polished Cabo base of operations.",
    includesHint: "Multi-boat fishing, villa coordination, transportation, provisioning, catch handling, on-ground coordination.",
  },
  {
    id: "nasty-cabo-week",
    title: "Nasty Cabo Week",
    guests: "8 guests",
    nights: "5 nights",
    fishingDays: "4 fishing days",
    fromPriceLabel: "Starting at $29,800",
    description:
      "A full week of Cabo fishing and downtime — more days on the water, one coordinated package.",
    includesHint: "Four fishing days, villa coordination, transportation, food/provisioning, catch handling.",
  },
  {
    id: "nasty-tournament-week",
    title: "Nasty Tournament Week",
    guests: "Custom",
    nights: "Custom",
    fishingDays: "Custom",
    fromPriceLabel: "Custom / quote",
    description:
      "Tournament-week planning with flexible boat days, peak-date strategy, and partner logistics.",
    includesHint: "Custom fishing plan, lodging partners, transport, provisioning, catch handling — quoted per group.",
  },
];

export const INQUIRY_PARTNER_DISCLAIMER =
  "Villa, transportation, meals, and other third-party services are coordinated by Nasty Sport Fishing and fulfilled by vetted local partners. These packages are inquiry-only — we do not auto-reserve multi-day boat or villa inventory online.";
