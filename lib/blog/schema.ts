/**
 * Blog Studio — Zod validation for API create/update/publish.
 */
import { z } from "zod";

const blockId = z.string().min(1).max(100);
const contentBlockSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    id: blockId,
    type: z.string(),
  }).passthrough()
);

export const createBlogPostSchema = z.object({
  title: z.string().min(1).max(300).trim(),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be kebab-case"),
  excerpt: z.string().max(500).optional().default(""),
  content: z.array(contentBlockSchema).optional().default([]),
  author: z.object({ name: z.string().max(200).optional().default(""), uid: z.string().optional(), avatarUrl: z.string().url().optional() }).optional(),
  taxonomy: z.object({ categories: z.array(z.string()).optional().default([]), tags: z.array(z.string()).optional().default([]) }).optional(),
});

export const updateBlogPostSchema = z.object({
  title: z.string().min(1).max(300).trim().optional(),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  excerpt: z.string().max(500).optional(),
  coverImage: z.object({
    url: z.string().url(),
    path: z.string(),
    alt: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  }).nullable().optional(),
  ogImage: z.object({
    url: z.string().url(),
    path: z.string(),
    alt: z.string().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  }).nullable().optional(),
  content: z.array(contentBlockSchema).optional(),
  contentText: z.string().optional(),
  seo: z.object({
    metaTitle: z.string().max(120).optional(),
    metaDescription: z.string().max(320).optional(),
    canonicalUrl: z.string().url().optional().nullable(),
    focusKeyword: z.string().max(100).optional(),
    robotsIndex: z.boolean().optional(),
    robotsFollow: z.boolean().optional(),
  }).optional(),
  schema: z.object({
    articleJsonLd: z.record(z.unknown()).optional(),
    faqJsonLd: z.record(z.unknown()).optional().nullable(),
    breadcrumbJsonLd: z.record(z.unknown()).optional(),
  }).optional(),
  author: z.object({ name: z.string().max(200).optional(), uid: z.string().optional(), avatarUrl: z.string().url().optional().nullable() }).optional(),
  taxonomy: z.object({ categories: z.array(z.string()).optional(), tags: z.array(z.string()).optional() }).optional(),
  stats: z.object({
    wordCount: z.number().optional(),
    readingTimeMinutes: z.number().optional(),
    headingCounts: z.object({ h1: z.number(), h2: z.number(), h3: z.number() }).optional(),
    imagesCount: z.number().optional(),
    imagesMissingAltCount: z.number().optional(),
    internalLinksCount: z.number().optional(),
    externalLinksCount: z.number().optional(),
    hasFaq: z.boolean().optional(),
    hasTable: z.boolean().optional(),
  }).optional(),
  status: z.enum(["draft", "in_review", "scheduled", "published", "archived"]).optional(),
  publishAt: z.string().datetime().nullable().optional(),
});

export const publishBlogPostSchema = z.object({
  action: z.enum(["publish_now", "schedule", "unpublish", "archive"]),
  publishAt: z.string().datetime().optional(), // required when action === "schedule"
}).refine(
  (data) => data.action !== "schedule" || (data.publishAt && new Date(data.publishAt) > new Date()),
  { message: "Scheduled publish must have publishAt in the future", path: ["publishAt"] }
);

/** Validation for allowing publish: title, slug, metaTitle, metaDescription, exactly one H1, cover alt. */
export function validatePublishRequirements(post: {
  title?: string;
  slug?: string;
  seo?: { metaTitle?: string; metaDescription?: string };
  coverImage?: { alt?: string } | null;
  content?: { type: string; content?: string }[];
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!post.title?.trim()) errors.push("Title is required");
  if (!post.slug?.trim()) errors.push("Slug is required");
  if (!post.seo?.metaTitle?.trim()) errors.push("Meta title is required");
  if (!post.seo?.metaDescription?.trim()) errors.push("Meta description is required");
  if (post.coverImage && !post.coverImage.alt?.trim()) errors.push("Cover image must have alt text");
  const headings = (post.content ?? []).filter((b) => b.type === "heading") as { level?: number; content?: string }[];
  const h1Count = headings.filter((h) => h.level === 1).length;
  if (h1Count === 0) errors.push("Content must have exactly one H1 heading");
  if (h1Count > 1) errors.push("Content must have exactly one H1 heading (found " + h1Count + ")");
  return { valid: errors.length === 0, errors };
}

export type CreateBlogPostInput = z.infer<typeof createBlogPostSchema>;
export type UpdateBlogPostInput = z.infer<typeof updateBlogPostSchema>;
export type PublishBlogPostInput = z.infer<typeof publishBlogPostSchema>;
