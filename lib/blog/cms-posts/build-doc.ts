import type { BlogPostDoc, BlogImageAsset, BlogPostSerialized, BlogSchemaFields } from "../types";
import { computeContentStats, contentBlocksToText } from "../content-stats";
import { buildSchemaFields } from "../schema-jsonld";
import type { CmsBlogPostSeed } from "./helpers";

const AUTHOR = { name: "Nasty Sport Fishing" };

/** Build a Firestore-ready published post document from seed data. */
export function buildPublishedPostDoc(
  seed: CmsBlogPostSeed,
  timestamps: {
    createdAt: import("firebase-admin").firestore.Timestamp;
    updatedAt: import("firebase-admin").firestore.Timestamp;
    lastPublishedAt: import("firebase-admin").firestore.Timestamp;
  }
): Omit<BlogPostDoc, "locks" | "views" | "clicks"> {
  const contentText = contentBlocksToText(seed.content);
  const stats = computeContentStats(seed.content);
  const coverImage = seed.coverImage as BlogImageAsset;
  const ogImage = coverImage;

  const base = {
    status: "published" as const,
    title: seed.title,
    slug: seed.slug,
    excerpt: seed.excerpt,
    coverImage,
    ogImage,
    content: seed.content,
    contentText,
    seo: seed.seo,
    author: AUTHOR,
    taxonomy: seed.taxonomy,
    stats,
    publishAt: null,
    lastPublishedAt: timestamps.lastPublishedAt,
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
    createdByUid: null,
    updatedByUid: null,
    revision: 1,
  };

  const rawSchema = buildSchemaFields({
    ...base,
    updatedAt: timestamps.updatedAt.toDate().toISOString(),
    lastPublishedAt: timestamps.lastPublishedAt.toDate().toISOString(),
    publishAt: null,
  } as unknown as BlogPostSerialized);

  const schema: BlogSchemaFields = {
    articleJsonLd: rawSchema.articleJsonLd,
    breadcrumbJsonLd: rawSchema.breadcrumbJsonLd,
    ...(rawSchema.faqJsonLd != null ? { faqJsonLd: rawSchema.faqJsonLd } : {}),
  };

  return { ...base, schema };
}
