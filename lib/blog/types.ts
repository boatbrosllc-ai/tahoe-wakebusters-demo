/**
 * Blog Studio — canonical types for Firestore and block-based content.
 * Portable block JSON; not raw MDX.
 */

export type BlogPostStatus = "draft" | "in_review" | "scheduled" | "published" | "archived";

export interface BlogImageAsset {
  url: string;
  path: string;
  alt?: string;
  width?: number;
  height?: number;
}

export interface BlogSeo {
  metaTitle: string;
  metaDescription: string;
  canonicalUrl?: string;
  focusKeyword?: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
}

export interface BlogSchemaFields {
  articleJsonLd?: Record<string, unknown>;
  faqJsonLd?: Record<string, unknown>;
  breadcrumbJsonLd?: Record<string, unknown>;
}

export interface BlogAuthor {
  name: string;
  uid?: string;
  avatarUrl?: string;
}

export interface BlogTaxonomy {
  categories: string[];
  tags: string[];
}

export interface BlogStats {
  wordCount: number;
  readingTimeMinutes: number;
  headingCounts: { h1: number; h2: number; h3: number };
  imagesCount: number;
  imagesMissingAltCount: number;
  internalLinksCount: number;
  externalLinksCount: number;
  hasFaq: boolean;
  hasTable: boolean;
}

export interface BlogPostLock {
  lockedByUid?: string;
  lockedAt?: string; // ISO
}

// ——— Block types (portable JSON) ———
export type BlockType =
  | "paragraph"
  | "heading"
  | "list"
  | "quote"
  | "image"
  | "gallery"
  | "table"
  | "embed"
  | "callout"
  | "faq"
  | "divider"
  | "keyTakeaways";

export interface BaseBlock {
  id: string;
}

export interface ParagraphBlock extends BaseBlock {
  type: "paragraph";
  content: string;
}

export interface HeadingBlock extends BaseBlock {
  type: "heading";
  level: 1 | 2 | 3;
  content: string;
}

export interface ListBlock extends BaseBlock {
  type: "list";
  ordered: boolean;
  items: string[];
}

export interface QuoteBlock extends BaseBlock {
  type: "quote";
  content: string;
  attribution?: string;
}

export interface ImageBlock extends BaseBlock {
  type: "image";
  url: string;
  alt: string;
  caption?: string;
  width?: number;
  height?: number;
}

export interface GalleryBlock extends BaseBlock {
  type: "gallery";
  images: { url: string; alt: string; caption?: string }[];
}

export interface TableBlock extends BaseBlock {
  type: "table";
  headers: string[];
  rows: string[][];
}

export interface EmbedBlock extends BaseBlock {
  type: "embed";
  provider: "youtube" | "instagram" | "tiktok" | "vimeo" | "other";
  url: string;
}

export interface CalloutBlock extends BaseBlock {
  type: "callout";
  title?: string;
  body: string;
  variant?: "info" | "warning" | "tip";
}

export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqBlock extends BaseBlock {
  type: "faq";
  items: FaqItem[];
}

export interface DividerBlock extends BaseBlock {
  type: "divider";
}

export interface KeyTakeawaysBlock extends BaseBlock {
  type: "keyTakeaways";
  items: string[];
}

export type ContentBlock =
  | ParagraphBlock
  | HeadingBlock
  | ListBlock
  | QuoteBlock
  | ImageBlock
  | GalleryBlock
  | TableBlock
  | EmbedBlock
  | CalloutBlock
  | FaqBlock
  | DividerBlock
  | KeyTakeawaysBlock;

/** Firestore Timestamp-like (seconds/nanoseconds); server uses getFirestoreExports().Timestamp. */
export interface TimestampLike {
  seconds: number;
  nanoseconds: number;
}

/** Firestore document shape for blogPosts collection. Timestamps are Firestore Timestamp in DB. */
export interface BlogPostDoc {
  status: BlogPostStatus;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: BlogImageAsset | null;
  ogImage: BlogImageAsset | null;
  content: ContentBlock[];
  contentText: string;
  seo: BlogSeo;
  schema: BlogSchemaFields;
  author: BlogAuthor;
  taxonomy: BlogTaxonomy;
  stats: BlogStats;
  publishAt: TimestampLike | null;
  lastPublishedAt: TimestampLike | null;
  createdAt: TimestampLike;
  updatedAt: TimestampLike;
  createdByUid: string | null;
  updatedByUid: string | null;
  revision: number;
  locks: BlogPostLock | null;
  // Optional analytics placeholders (integrate later)
  views?: number;
  clicks?: number;
}

/** Serialized for API/JSON: timestamps as ISO strings. */
export interface BlogPostSerialized extends Omit<BlogPostDoc, "publishAt" | "lastPublishedAt" | "createdAt" | "updatedAt"> {
  publishAt: string | null;
  lastPublishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AuditAction =
  | "create"
  | "save"
  | "publish"
  | "schedule"
  | "unpublish"
  | "archive"
  | "restore_version"
  | "delete";

export interface BlogAuditLogEntry {
  actorUid: string | null;
  action: AuditAction;
  postId: string;
  timestamp: TimestampLike;
  diffSummary?: string;
  requestId?: string;
}

export interface BlogPostVersionSnapshot {
  savedAt: TimestampLike;
  savedByUid: string | null;
  revision: number;
  title: string;
  slug: string;
  content: ContentBlock[];
  contentText: string;
  seo: BlogSeo;
  status: BlogPostStatus;
}
