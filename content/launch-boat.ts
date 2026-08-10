/**
 * Launch fleet — single boat for NSF go-live.
 * Seeded into Firestore via POST /api/admin/seed; photo lives under public/photos/nsf.
 */

export const LAUNCH_BOAT = {
  name: "Cabo 40 Express",
  slug: "cabo-40-express",
  /** Previous seed name/slug so re-seed upgrades the existing doc when present. */
  previousNames: ["Nasty Sportfisher"] as const,
  previousSlugs: ["nasty-sportfisher"] as const,
  year: 2010,
  model: "40 Express",
  make: "Cabo",
  heroSubtitle: "Cabo San Lucas sportfisher · Captain & crew included",
  capacity: 6,
  timezone: "America/Mazatlan",
  capacityMax: 6,
  petsMax: 0,
  defaultLocationText: "Marina Cabo San Lucas — we'll send exact slip / meet-up after booking.",
  cancellationPolicyText:
    "Free cancellation up to 30 days before. Partial refund 15–30 days before. No refund within 14 days.",
  photos: ["/photos/nsf/cabo-40-express.png"] as string[],
  description: [
    "The 2010 Cabo 40 Express is Nasty Sport Fishing's flagship offshore sportfisher — a Michael Peters–designed hard-top express built to fish Cabo San Lucas.",
    "Specs: 42'10\" LOA, 15'9\" beam, 3'5\" draft. Twin Cummins QSC 600 diesels (1,200 hp total) with tuna tower, outriggers, and a serious cockpit for bluewater work.",
    "Every charter includes a licensed captain and mate, premium tackle, and local-grounds fuel. Book Half Day or Full Day and we'll put you on the water.",
  ].join("\n\n"),
} as const;

/** Public path for the flagship boat — used while we only list one vessel. */
export const OUR_BOAT_PATH = `/boats/${LAUNCH_BOAT.slug}` as const;
