import { brand } from "@/content/brand";
/**
 * Build JSON-LD schema (Article, Breadcrumb, FAQ) for blog posts.
 */

import type { BlogPostDoc, BlogPostSerialized, ContentBlock, FaqBlock } from "./types";
import { getSiteBaseUrl } from "@/config/site";


const BASE_URL = getSiteBaseUrl();

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function postUrl(slug: string, canonicalUrl?: string): string {
  const trimmed = canonicalUrl?.trim();
  if (trimmed) return trimmed.replace(/\/+$/, "");
  return `${stripTrailingSlash(BASE_URL)}/blog/${encodeURIComponent(slug)}`;
}

/** Article schema from post (always emitted). */
export function buildArticleJsonLd(
  post: Pick<
    BlogPostDoc | BlogPostSerialized,
    "title" | "slug" | "excerpt" | "author" | "coverImage" | "ogImage" | "contentText" | "stats" | "updatedAt" | "lastPublishedAt" | "publishAt"
  > & { seo?: { canonicalUrl?: string } }
): Record<string, unknown> {
  const url = postUrl(post.slug, post.seo?.canonicalUrl);
  const datePublished =
    typeof post.lastPublishedAt === "string"
      ? post.lastPublishedAt
      : post.lastPublishedAt
        ? new Date((post.lastPublishedAt as { seconds: number }).seconds * 1000).toISOString()
        : typeof post.publishAt === "string"
          ? post.publishAt
          : post.publishAt
            ? new Date((post.publishAt as { seconds: number }).seconds * 1000).toISOString()
            : undefined;
  const dateModified =
    typeof post.updatedAt === "string" ? post.updatedAt : new Date((post.updatedAt as { seconds: number }).seconds * 1000).toISOString();
  const image = post.ogImage?.url ?? post.coverImage?.url;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    url,
    datePublished: datePublished ?? dateModified,
    dateModified,
    author: {
      "@type": "Person",
      name: post.author?.name ?? `${brand.companyName}`,
    },
    ...(image && { image: image }),
    ...(post.stats?.wordCount && { wordCount: post.stats.wordCount }),
  };
}

/** Breadcrumb: Home > Blog > [Post title]. */
export function buildBreadcrumbJsonLd(
  post: Pick<BlogPostDoc | BlogPostSerialized, "title" | "slug"> & { seo?: { canonicalUrl?: string } }
): Record<string, unknown> {
  const url = postUrl(post.slug, post.seo?.canonicalUrl);
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: stripTrailingSlash(BASE_URL) },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${stripTrailingSlash(BASE_URL)}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };
}

/** FAQ schema from FAQ blocks only. */
export function buildFaqJsonLd(content: ContentBlock[]): Record<string, unknown> | null {
  const faqBlocks = content.filter((b): b is FaqBlock => b.type === "faq");
  const allItems = faqBlocks.flatMap((b) => b.items ?? []);
  if (allItems.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: allItems.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };
}

/** Build all schema fields for a post; store in post.schema. */
export function buildSchemaFields(post: BlogPostDoc | BlogPostSerialized): {
  articleJsonLd: Record<string, unknown>;
  breadcrumbJsonLd: Record<string, unknown>;
  faqJsonLd: Record<string, unknown> | null;
} {
  return {
    articleJsonLd: buildArticleJsonLd(post),
    breadcrumbJsonLd: buildBreadcrumbJsonLd(post),
    faqJsonLd: buildFaqJsonLd(post.content),
  };
}
