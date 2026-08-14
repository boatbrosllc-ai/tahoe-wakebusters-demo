import { brand } from "@/content/brand";
import { siteConfig } from "@/config/site";
/**
 * Launch fleet — single placeholder boat for platform-dev.
 * Seeded into Firestore via POST /api/admin/seed.
 *
 * Keep `slug` and `previousSlugs` stable so re-seed updates the existing boat doc.
 */

export const LAUNCH_BOAT = {
  name: "40 Express",
  slug: "cabo-40-express",
  /** Previous seed name/slug so re-seed upgrades the existing doc when present. */
  previousNames: ["Nasty Sportfisher", "Cabo 40 Express"] as const,
  previousSlugs: ["nasty-sportfisher"] as const,
  year: 2010,
  model: "40 Express",
  make: "Express",
  heroSubtitle: "Captain & crew included",
  capacity: 6,
  timezone: brand.timezone,
  capacityMax: 6,
  petsMax: 0,
  defaultLocationText: siteConfig.contact.marinaMeetNote,
  cancellationPolicyText:
    "Free cancellation up to 30 days before. Partial refund 15–30 days before. No refund within 14 days.",
  photos: [siteConfig.media.listingFallback] as string[],
  description: [
    `The 40 Express is ${brand.companyName}'s flagship private charter boat — captain and crew included on every trip.`,
    "Every charter includes a licensed captain and mate. Book Half Day or Full Day and we'll put you on the water.",
  ].join("\n\n"),
} as const;

/** Public path for the flagship boat — used while we only list one vessel. */
export const OUR_BOAT_PATH = `/boats/${LAUNCH_BOAT.slug}` as const;
