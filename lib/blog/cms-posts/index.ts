import type { CmsBlogPostSeed } from "./helpers";

/**
 * CMS blog seed articles for Firestore seeding.
 * Austin/Boat Bros SEO seeds were removed — add Cabo fishing posts here when ready.
 */
export const CMS_BLOG_POST_SEEDS: CmsBlogPostSeed[] = [];

export function getCmsBlogPostSeedBySlug(slug: string): CmsBlogPostSeed | undefined {
  return CMS_BLOG_POST_SEEDS.find((p) => p.slug === slug);
}
