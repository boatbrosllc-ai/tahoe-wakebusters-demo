import { brand } from "@/content/brand";
import { getCmsBlogPostSeedBySlug } from "./index";
import type { FirestorePost } from "@/components/site/FirestoreBlogPostView";

/** Render CMS seed files when Firestore has not been seeded yet. */
export function cmsSeedToViewPost(slug: string): FirestorePost | null {
  const seed = getCmsBlogPostSeedBySlug(slug);
  if (!seed) return null;
  return {
    title: seed.title,
    excerpt: seed.excerpt,
    slug: seed.slug,
    coverImage: { url: seed.coverImage.path, alt: seed.coverImage.alt },
    author: { name: `${brand.companyName}` },
    content: seed.content,
    categories: seed.taxonomy.categories,
    tags: seed.taxonomy.tags,
  };
}
