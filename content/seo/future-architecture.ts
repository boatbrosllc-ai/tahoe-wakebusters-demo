/**
 * Future SEO architecture — unpublished paths only.
 *
 * These URLs are reserved for later month pages and extra species pillars.
 * Do NOT add them to the sitemap or create thin placeholder pages until each
 * URL has unique, verified content.
 *
 * Canonical list lives in `lib/seo/paths.ts` as `SEO_FUTURE_UNPUBLISHED_PATHS`:
 * - /cabo-tuna-fishing
 * - /cabo-dorado-fishing
 * - /cabo-wahoo-fishing
 * - /cabo-fishing-january … /cabo-fishing-december
 *
 * Publish order when ready:
 * 1. Species pillars with distinct intent + first-party notes
 * 2. Month pages only after calendar cells are verified from trip reports
 */

import { SEO_FUTURE_UNPUBLISHED_PATHS } from "@/lib/seo/paths";

/** Documentation export — mirrors unpublished path registry for content ops. */
export const FUTURE_SEO_ARCHITECTURE_NOTE =
  "Unpublished month/species URLs are listed in SEO_FUTURE_UNPUBLISHED_PATHS. Keep them out of the sitemap until unique content exists.";

export const FUTURE_SEO_PATHS = SEO_FUTURE_UNPUBLISHED_PATHS;
