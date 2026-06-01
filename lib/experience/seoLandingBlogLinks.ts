import { blogPosts } from "@/content/blog";
import { CMS_BLOG_POST_SEEDS } from "@/lib/blog/cms-posts";
import type { RelatedArticleLink } from "@/components/experience/RelatedArticlesSection";
import type { SeoLandingPageId } from "@/lib/experience/seoLanding.data";

const BLOG_BY_SLUG = new Map(
  [
    ...blogPosts.map((p) => [
      p.slug,
      { title: p.title, excerpt: p.excerpt, image: p.image, imageAlt: p.imageAlt ?? p.title },
    ] as const),
    ...CMS_BLOG_POST_SEEDS.map((p) => [
      p.slug,
      { title: p.title, excerpt: p.excerpt, image: p.coverImage.path, imageAlt: p.coverImage.alt },
    ] as const),
  ]
);

const RELATED_SLUGS: Partial<Record<SeoLandingPageId, string[]>> = {
  "boat-rental-austin": [
    "fun-things-to-do-in-austin-for-adults",
    "fun-things-to-do-in-austin",
    "things-to-do-in-austin",
    "what-to-bring-lake-austin-boat-rental",
    "best-coves-spots-lake-austin-pontoon-swimming",
  ],
  "lake-austin-boat-rentals": [
    "lake-austin-boat-guide",
    "outdoor-things-to-do-in-austin",
    "austin-activities",
    "best-coves-spots-lake-austin-pontoon-swimming",
    "lake-austin-sunset-cruise-guide",
    "best-restaurants-lake-austin-boat-day",
  ],
  "austin-party-boat-rentals": [
    "lake-austin-bachelorette-boat-rental-guide",
    "austin-bachelorette-party-guide-2026-lake-austin-boat-day",
  ],
  "pontoon-boat-rental-austin": [
    "family-friendly-things-to-do-in-austin",
    "best-coves-spots-lake-austin-pontoon-swimming",
    "what-to-bring-lake-austin-boat-rental",
  ],
  "lake-austin-party-boat-rentals": [
    "lake-austin-bachelorette-boat-rental-guide",
    "best-coves-spots-lake-austin-pontoon-swimming",
  ],
  "private-boat-rental-austin": ["what-to-bring-lake-austin-boat-rental"],
  "captained-boat-rental-austin": ["what-to-bring-lake-austin-boat-rental"],
  "boat-ride-austin": [
    "things-to-do-in-downtown-austin",
    "lake-austin-sunset-cruise-guide",
  ],
  "wakesurfing-austin": ["what-to-bring-lake-austin-boat-rental"],
  "wake-boat-rental-austin": ["what-to-bring-lake-austin-boat-rental", "austin-bachelor-party-ideas"],
  "wakesurf-club-austin": ["what-to-bring-lake-austin-boat-rental"],
  "sunset-cruise-austin": [
    "austin-weekend-getaway",
    "lake-austin-sunset-cruise-guide",
    "best-restaurants-lake-austin-boat-day",
  ],
  "lake-austin-sunset-cruise": ["lake-austin-sunset-cruise-guide"],
  "lake-austin-vs-lake-travis-boat-rental": [
    "party-boat-rental-austin-lake-austin-vs-lake-travis",
    "best-coves-spots-lake-austin-pontoon-swimming",
    "lake-austin-sunset-cruise-guide",
  ],
};

export function getLiveRelatedArticles(pageId: SeoLandingPageId): RelatedArticleLink[] {
  const slugs = RELATED_SLUGS[pageId] ?? [];
  const out: RelatedArticleLink[] = [];
  for (const slug of slugs) {
    const post = BLOG_BY_SLUG.get(slug);
    if (!post) continue;
    out.push({
      href: `/blog/${slug}`,
      title: post.title,
      excerpt: post.excerpt.slice(0, 140),
      image: post.image,
      imageAlt: post.imageAlt,
    });
  }
  return out;
}
