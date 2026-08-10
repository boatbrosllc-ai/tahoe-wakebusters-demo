/**
 * Indexable SEO growth URLs for Nasty Sport Fishing.
 * Only canonical, content-ready paths — no thin placeholders.
 */

export const SEO_COMMERCIAL_PATHS = [
  "/cabo-san-lucas-fishing-charters",
  "/deep-sea-fishing-cabo",
  "/los-cabos-fishing-charters",
  "/cabo-fishing-charter-prices",
  "/best-fishing-charters-cabo-san-lucas",
  "/cabo-fish-processing",
] as const;

export const SEO_AUTHORITY_PATHS = [
  "/cabo-marlin-fishing",
  "/cabo-roosterfish-fishing",
  "/cabo-fishing-calendar",
  "/best-time-to-fish-cabo",
] as const;

export const SEO_REPORT_PATHS = ["/fishing-reports"] as const;

/** Paths ready for sitemap (published, non-thin). */
export const SEO_SITEMAP_PATHS: readonly string[] = [
  ...SEO_COMMERCIAL_PATHS,
  ...SEO_AUTHORITY_PATHS,
  ...SEO_REPORT_PATHS,
];

/**
 * Future architecture only — DO NOT add to sitemap until unique content exists.
 * Month pages and extra species pillars stay unpublished here.
 */
export const SEO_FUTURE_UNPUBLISHED_PATHS = [
  "/cabo-tuna-fishing",
  "/cabo-dorado-fishing",
  "/cabo-wahoo-fishing",
  "/cabo-fishing-january",
  "/cabo-fishing-february",
  "/cabo-fishing-march",
  "/cabo-fishing-april",
  "/cabo-fishing-may",
  "/cabo-fishing-june",
  "/cabo-fishing-july",
  "/cabo-fishing-august",
  "/cabo-fishing-september",
  "/cabo-fishing-october",
  "/cabo-fishing-november",
  "/cabo-fishing-december",
] as const;

export type SeoCommercialPath = (typeof SEO_COMMERCIAL_PATHS)[number];
export type SeoAuthorityPath = (typeof SEO_AUTHORITY_PATHS)[number];
