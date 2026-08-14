import { brand } from "@/content/brand";
import { siteConfig } from "@/config/site";
import { DEFAULT_CANCELLATION_POLICY } from "@/lib/booking/cancellation-policy";
/**
 * Launch fleet — single placeholder boat for the master template.
 * Seeded into Firestore via POST /api/admin/seed.
 *
 * Replace name/slug/photos from a launch packet. Keep `slug` stable after go-live
 * so re-seed updates the existing boat doc.
 */

export const LAUNCH_BOAT = {
  name: "Charter Boat",
  slug: "charter-boat",
  previousNames: [] as const,
  previousSlugs: [] as const,
  year: 2020,
  model: "Charter",
  make: "Custom",
  heroSubtitle: "Captain & crew included",
  capacity: 6,
  timezone: brand.timezone,
  capacityMax: 6,
  petsMax: 0,
  defaultLocationText: siteConfig.contact.marinaMeetNote,
  cancellationPolicyText: DEFAULT_CANCELLATION_POLICY,
  photos: [siteConfig.media.listingFallback] as string[],
  description: [
    `The charter boat is ${brand.companyName}'s primary vessel — captain and crew included on every trip.`,
    "Book Half Day or Full Day and we'll confirm dock details after you reserve.",
  ].join("\n\n"),
} as const;

/** Public path for the flagship boat — used while we only list one vessel. */
export const OUR_BOAT_PATH = `/boats/${LAUNCH_BOAT.slug}` as const;
