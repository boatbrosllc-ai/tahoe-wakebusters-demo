import "server-only";
import type { BlogCategory, BlogPost } from "@/content/blog";
import type { SerializedFirestorePost } from "@/lib/blog/firestore";

const VALID_CATEGORIES: BlogCategory[] = ["fishing-tips", "cabo-guides", "charter-news", "general"];

function toBlogCategory(categories: string[] | undefined): BlogCategory {
  const first = categories?.[0];
  if (first && VALID_CATEGORIES.includes(first as BlogCategory)) return first as BlogCategory;
  return "general";
}

function isoDateOnly(value: string | null | undefined): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  return value.slice(0, 10);
}

/** Map a published Firestore post to the public blog listing shape (body omitted). */
export function firestorePostToBlogPost(post: SerializedFirestorePost): BlogPost {
  const cover = post.coverImage as { url?: string; alt?: string } | null;
  const stats = post.stats as { readingTimeMinutes?: number } | undefined;
  const taxonomy = post.taxonomy as { categories?: string[] } | undefined;
  const author = post.author as { name?: string } | undefined;
  const date = isoDateOnly(
    (post.lastPublishedAt as string | null) ??
      (post.publishAt as string | null) ??
      (post.createdAt as string | undefined)
  );

  return {
    slug: String(post.slug),
    title: String(post.title ?? "Untitled"),
    excerpt: String(post.excerpt ?? ""),
    date,
    dateModified: post.updatedAt ? isoDateOnly(String(post.updatedAt)) : undefined,
    author: author?.name,
    image: cover?.url,
    imageAlt: cover?.alt,
    category: toBlogCategory(taxonomy?.categories),
    readingTimeMinutes: stats?.readingTimeMinutes,
    body: [],
  };
}

/** CMS posts win on slug collision; result sorted newest-first by date. */
export function mergePublicBlogPosts(staticPosts: BlogPost[], cmsPosts: SerializedFirestorePost[]): BlogPost[] {
  const cmsSlugs = new Set(cmsPosts.map((p) => String(p.slug)));
  const fromCms = cmsPosts.map(firestorePostToBlogPost);
  const staticOnly = staticPosts.filter((p) => !cmsSlugs.has(p.slug));
  return [...fromCms, ...staticOnly].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}
