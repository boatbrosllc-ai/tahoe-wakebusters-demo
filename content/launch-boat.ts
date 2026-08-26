import { brand } from "@/content/brand";
import { siteConfig } from "@/config/site";
import { DEFAULT_CANCELLATION_POLICY } from "@/lib/booking/cancellation-policy";

/**
 * Flagship boat for seed — 30' Double Decker Party Barge.
 */

export const LAUNCH_BOAT = {
  name: "30′ Double Decker Party Barge",
  slug: "party-barge",
  previousNames: [] as const,
  previousSlugs: ["charter-boat"] as const,
  year: 2020,
  model: "Double Decker Party Barge",
  make: "Custom",
  heroSubtitle: "Dual slides · Grill · Up to 13 · Gas included",
  capacity: 13,
  timezone: brand.timezone,
  capacityMax: 13,
  petsMax: 2,
  defaultLocationText: siteConfig.contact.marinaMeetNote,
  cancellationPolicyText: DEFAULT_CANCELLATION_POLICY,
  photos: [
    "/photos/wakebusters/party-barge.jpg",
    "/photos/wakebusters/hero-slides.jpg",
    "/photos/wakebusters/party-crew.jpg",
  ] as string[],
  description: [
    "The ultimate Tahoe party boat. Dual waterslides, a full propane grill, water toys, and room for the whole crew.",
    "Full tank of gas and safety gear included. Captain required — fees paid separately to your USCG-certified captain.",
  ].join("\n\n"),
} as const;

export const OUR_BOAT_PATH = `/boats/${LAUNCH_BOAT.slug}` as const;
