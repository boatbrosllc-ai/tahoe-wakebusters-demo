import { brand } from "@/content/brand";
import "server-only";
import { blogPosts, type BlogCategory, type BlogPost } from "@/content/blog";
import { CMS_BLOG_POST_SEEDS } from "@/lib/blog/cms-posts";
import { getDb } from "@/lib/booking/firebase-admin";

/** Display date for repo CMS seeds until Firestore publish dates exist. */
const CMS_SEED_HUB_DATE = "2025-06-01";

const VALID_CATEGORIES: readonly BlogCategory[] = ["fishing-tips", "cabo-guides", "charter-news", "general"];

function mapFirestoreCategory(categories: string[] | undefined): BlogCategory {
  const first = categories?.[0]?.trim();
  if (first && (VALID_CATEGORIES as readonly string[]).includes(first)) {
    return first as BlogCategory;
  }
  return "general";
}

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

/** Published Firestore posts mapped to the static BlogPost hub shape. */
export async function getPublishedFirestoreBlogHubPosts(): Promise<BlogPost[]> {
  const db = getDb();
  const snap = await db.collection("blogPosts").where("status", "==", "published").get();
  const posts: BlogPost[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() as {
      slug?: string;
      title?: string;
      excerpt?: string;
      coverImage?: { url?: string; alt?: string } | null;
      author?: { name?: string };
      taxonomy?: { categories?: string[] };
      stats?: { readingTimeMinutes?: number };
      publishAt?: unknown;
      lastPublishedAt?: unknown;
      updatedAt?: unknown;
      seo?: { robotsIndex?: boolean };
    };
    if (data.seo?.robotsIndex === false) continue;
    const slug = typeof data.slug === "string" ? data.slug.trim() : "";
    if (!slug) continue;
    const date =
      toIso(data.lastPublishedAt) ??
      toIso(data.publishAt) ??
      toIso(data.updatedAt) ??
      new Date().toISOString().slice(0, 10);
    posts.push({
      slug,
      title: typeof data.title === "string" ? data.title : slug,
      excerpt: typeof data.excerpt === "string" ? data.excerpt : "",
      date: date.slice(0, 10),
      dateModified: toIso(data.updatedAt)?.slice(0, 10),
      author: data.author?.name ?? `${brand.companyName}`,
      image: data.coverImage?.url,
      imageAlt: data.coverImage?.alt,
      category: mapFirestoreCategory(data.taxonomy?.categories),
      readingTimeMinutes: data.stats?.readingTimeMinutes,
      body: [],
    });
  }
  return posts;
}

/** CMS seed files in repo — shown on hub until Firestore has a published doc for the slug. */
function getCmsSeedHubPosts(): BlogPost[] {
  return CMS_BLOG_POST_SEEDS.filter((seed) => seed.seo.robotsIndex !== false).map((seed) => ({
    slug: seed.slug,
    title: seed.title,
    excerpt: seed.excerpt,
    date: CMS_SEED_HUB_DATE,
    author: `${brand.companyName}`,
    image: seed.coverImage.path,
    imageAlt: seed.coverImage.alt,
    category: mapFirestoreCategory(seed.taxonomy.categories),
    body: [],
  }));
}

/** Merge static, CMS seeds, and Firestore blog posts for the hub; Firestore wins slug collisions. */
export async function getBlogHubPosts(): Promise<BlogPost[]> {
  let firestorePosts: BlogPost[] = [];
  try {
    firestorePosts = await getPublishedFirestoreBlogHubPosts();
  } catch {
    // Firebase unavailable — static + CMS seeds only
  }
  const bySlug = new Map<string, BlogPost>();
  for (const post of blogPosts) bySlug.set(post.slug, post);
  for (const post of getCmsSeedHubPosts()) {
    if (!bySlug.has(post.slug)) bySlug.set(post.slug, post);
  }
  for (const post of firestorePosts) bySlug.set(post.slug, post);
  return Array.from(bySlug.values()).sort((a, b) => b.date.localeCompare(a.date));
}
