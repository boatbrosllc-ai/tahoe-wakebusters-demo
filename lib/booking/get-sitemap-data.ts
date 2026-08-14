import "server-only";
import { blogPosts } from "@/content/blog";
import { CMS_BLOG_POST_SEEDS } from "@/lib/blog/cms-posts";
import { getDb } from "@/lib/booking/firebase-admin";
import { resolveCanonicalExperienceSlug } from "@/lib/booking/experience-aliases";
import { getSiteBaseUrl } from "@/config/site";


const baseUrl = getSiteBaseUrl();

export interface SitemapBlogPost {
  slug: string;
  updatedAt?: string;
  publishedAt?: string;
  canonicalUrl?: string;
}

export interface SitemapExperienceEntry {
  slug: string;
  updatedAt?: string;
}

/** Stable fallback when Firebase is unavailable during sitemap generation. */
export const FALLBACK_EXPERIENCE_PAGE_SLUGS: readonly string[] = [
  "half-day",
  "full-day",
];

function toIso(t: unknown): string | undefined {
  if (!t || typeof t !== "object") return undefined;
  if ("toDate" in t && typeof (t as { toDate: () => Date }).toDate === "function") {
    return (t as { toDate: () => Date }).toDate().toISOString();
  }
  if ("seconds" in t && typeof (t as { seconds: number }).seconds === "number") {
    return new Date((t as { seconds: number }).seconds * 1000).toISOString();
  }
  return undefined;
}

/** Returns true when the post canonical is this site's `/blog/{slug}` URL (or unset). */
export function isLocalBlogCanonical(slug: string, canonicalUrl?: string): boolean {
  const trimmed = canonicalUrl?.trim();
  if (!trimmed) return true;
  const expected = `${baseUrl}/blog/${encodeURIComponent(slug)}`.replace(/\/+$/, "");
  return trimmed.replace(/\/+$/, "") === expected;
}

/** Published Firestore blog posts eligible for sitemap (robotsIndex !== false, local canonical). */
export async function getPublishedBlogPostsForSitemap(): Promise<SitemapBlogPost[]> {
  const db = getDb();
  const snap = await db.collection("blogPosts").where("status", "==", "published").get();
  const posts: SitemapBlogPost[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as {
      slug?: string;
      updatedAt?: unknown;
      lastPublishedAt?: unknown;
      publishAt?: unknown;
      seo?: { robotsIndex?: boolean; canonicalUrl?: string };
    };
    if (data.seo?.robotsIndex === false) continue;
    const slug = typeof data.slug === "string" ? data.slug.trim() : "";
    if (!slug) continue;
    const canonicalUrl = typeof data.seo?.canonicalUrl === "string" ? data.seo.canonicalUrl.trim() : undefined;
    if (!isLocalBlogCanonical(slug, canonicalUrl)) continue;
    posts.push({
      slug,
      updatedAt: toIso(data.updatedAt),
      publishedAt: toIso(data.lastPublishedAt) ?? toIso(data.publishAt),
      ...(canonicalUrl ? { canonicalUrl } : {}),
    });
  }
  return posts;
}

/** Static blog posts for sitemap fallback and dedupe. */
export function getStaticBlogPostsForSitemap(): SitemapBlogPost[] {
  const bySlug = new Map<string, SitemapBlogPost>();
  for (const post of blogPosts) {
    bySlug.set(post.slug, {
      slug: post.slug,
      publishedAt: post.date,
      updatedAt: post.dateModified ?? post.date,
    });
  }
  for (const seed of CMS_BLOG_POST_SEEDS) {
    if (!bySlug.has(seed.slug)) {
      bySlug.set(seed.slug, { slug: seed.slug });
    }
  }
  return Array.from(bySlug.values());
}

/** Active experience canonical page slugs from Firestore for `/experiences/{slug}` sitemap entries. */
export async function getActiveExperienceSlugsForSitemap(): Promise<SitemapExperienceEntry[]> {
  const db = getDb();
  const snap = await db.collection("experiences").where("active", "==", true).get();
  const byCanonical = new Map<string, SitemapExperienceEntry>();
  for (const doc of snap.docs) {
    const data = doc.data() as { slug?: string; updatedAt?: unknown };
    const raw = typeof data.slug === "string" ? data.slug.trim().toLowerCase() : "";
    if (!raw) continue;
    const canonical = resolveCanonicalExperienceSlug(raw, raw);
    const updatedAt = toIso(data.updatedAt);
    const existing = byCanonical.get(canonical);
    if (!existing) {
      byCanonical.set(canonical, { slug: canonical, ...(updatedAt ? { updatedAt } : {}) });
      continue;
    }
    if (updatedAt && (!existing.updatedAt || updatedAt > existing.updatedAt)) {
      byCanonical.set(canonical, { slug: canonical, updatedAt });
    }
  }
  return Array.from(byCanonical.values());
}

/** Fallback experience slugs when Firestore is unavailable. */
export function getFallbackExperienceSlugsForSitemap(): SitemapExperienceEntry[] {
  return FALLBACK_EXPERIENCE_PAGE_SLUGS.map((slug) => ({ slug }));
}
