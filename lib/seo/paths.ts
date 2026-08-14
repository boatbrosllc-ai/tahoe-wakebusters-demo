/**
 * Indexable SEO growth URLs for this operator.
 * The master template ships with none — customer clones add their own.
 */

export const SEO_COMMERCIAL_PATHS = [] as const;

export const SEO_AUTHORITY_PATHS = [] as const;

export const SEO_REPORT_PATHS = [] as const;

/** Paths ready for sitemap (published, non-thin). */
export const SEO_SITEMAP_PATHS: readonly string[] = [
  ...SEO_COMMERCIAL_PATHS,
  ...SEO_AUTHORITY_PATHS,
  ...SEO_REPORT_PATHS,
];

/**
 * Reserved future paths — DO NOT add to sitemap until unique content exists.
 */
export const SEO_FUTURE_UNPUBLISHED_PATHS = [] as const;

export type SeoCommercialPath = (typeof SEO_COMMERCIAL_PATHS)[number];
export type SeoAuthorityPath = (typeof SEO_AUTHORITY_PATHS)[number];
