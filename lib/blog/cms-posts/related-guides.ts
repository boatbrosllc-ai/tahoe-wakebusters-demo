import type { RelatedArticleLink } from "@/components/experience/RelatedArticlesSection";
import { CMS_BLOG_POST_SEEDS, getCmsBlogPostSeedBySlug } from "./index";

/** Related CMS guides by shared taxonomy tags (for guide footers). */
export function getRelatedCmsGuides(slug: string, limit = 2): RelatedArticleLink[] {
  const seed = getCmsBlogPostSeedBySlug(slug);
  if (!seed) return [];

  const tags = new Set(seed.taxonomy.tags);
  const scored = CMS_BLOG_POST_SEEDS.filter((p) => p.slug !== slug)
    .map((p) => ({
      post: p,
      score: p.taxonomy.tags.filter((t) => tags.has(t)).length,
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ post }) => ({
    href: `/blog/${post.slug}`,
    title: post.title,
    excerpt: post.excerpt.slice(0, 140),
    image: post.coverImage.path,
    imageAlt: post.coverImage.alt,
  }));
}
