/**
 * Blog Studio — Firestore collections and helpers. Server-only.
 */
import "server-only";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import type {
  BlogPostDoc,
  BlogSeo,
  BlogStats,
  BlogTaxonomy,
  BlogAuthor,
  ContentBlock,
  BlogAuditLogEntry,
  BlogPostVersionSnapshot,
} from "./types";

const BLOG_POSTS = "blogPosts";
const BLOG_AUDIT_LOGS = "blogAuditLogs";
const BLOG_TAXONOMY = "blogTaxonomy";

/** Firestore does not accept undefined. Return SEO with optional fields omitted so we never write undefined. */
function defaultSeo(): BlogSeo {
  return {
    metaTitle: "",
    metaDescription: "",
    robotsIndex: true,
    robotsFollow: true,
  };
}

function defaultStats(): BlogStats {
  return {
    wordCount: 0,
    readingTimeMinutes: 0,
    headingCounts: { h1: 0, h2: 0, h3: 0 },
    imagesCount: 0,
    imagesMissingAltCount: 0,
    internalLinksCount: 0,
    externalLinksCount: 0,
    hasFaq: false,
    hasTable: false,
  };
}

export function getBlogPostsRef() {
  return getDb().collection(BLOG_POSTS);
}

export function getBlogPostRef(postId: string) {
  return getDb().collection(BLOG_POSTS).doc(postId);
}

export function getBlogVersionsRef(postId: string) {
  return getDb().collection(BLOG_POSTS).doc(postId).collection("versions");
}

export function getBlogAuditLogsRef() {
  return getDb().collection(BLOG_AUDIT_LOGS);
}

export function getBlogTaxonomyRef() {
  return getDb().collection(BLOG_TAXONOMY).doc("singleton");
}

/** Build a new post document for create (caller adds id). */
export function buildNewPostDoc(params: {
  title: string;
  slug: string;
  excerpt?: string;
  content?: ContentBlock[];
  contentText?: string;
  author?: BlogAuthor;
  taxonomy?: BlogTaxonomy;
  createdByUid?: string | null;
}): Omit<BlogPostDoc, "publishAt" | "lastPublishedAt" | "createdAt" | "updatedAt"> & {
  publishAt: import("firebase-admin").firestore.Timestamp | null;
  lastPublishedAt: import("firebase-admin").firestore.Timestamp | null;
  createdAt: import("firebase-admin").firestore.Timestamp;
  updatedAt: import("firebase-admin").firestore.Timestamp;
} {
  const { FieldValue, Timestamp } = getFirestoreExports();
  const now = Timestamp.now();
  return {
    status: "draft",
    title: params.title,
    slug: params.slug,
    excerpt: params.excerpt ?? "",
    coverImage: null,
    ogImage: null,
    content: params.content ?? [],
    contentText: params.contentText ?? "",
    seo: defaultSeo(),
    schema: {},
    author: params.author ?? { name: "" },
    taxonomy: params.taxonomy ?? { categories: [], tags: [] },
    stats: defaultStats(),
    publishAt: null,
    lastPublishedAt: null,
    createdAt: now,
    updatedAt: now,
    createdByUid: params.createdByUid ?? null,
    updatedByUid: params.createdByUid ?? null,
    revision: 1,
    locks: null,
  };
}

function toIso(t: { seconds: number; nanoseconds: number } | null | undefined): string | null {
  if (!t || typeof t !== "object") return null;
  const sec = "seconds" in t ? (t as { seconds: number }).seconds : 0;
  const nan = "nanoseconds" in t ? (t as { nanoseconds: number }).nanoseconds : 0;
  return new Date(sec * 1000 + nan / 1e6).toISOString();
}

/** Convert Firestore doc to API response shape (timestamps as ISO strings). */
export function toSerializedPost(
  doc: { id: string; data: () => Record<string, unknown> | undefined }
): { id: string } & Record<string, unknown> | null {
  const d = doc.data();
  if (!d) return null;
  return {
    id: doc.id,
    ...d,
    publishAt: d.publishAt ? toIso(d.publishAt as { seconds: number; nanoseconds: number }) : null,
    lastPublishedAt: d.lastPublishedAt ? toIso(d.lastPublishedAt as { seconds: number; nanoseconds: number }) : null,
    createdAt: toIso(d.createdAt as { seconds: number; nanoseconds: number }) ?? "",
    updatedAt: toIso(d.updatedAt as { seconds: number; nanoseconds: number }) ?? "",
  } as { id: string } & Record<string, unknown>;
}

/** Write an audit log entry. */
export async function writeAuditLog(entry: Omit<BlogAuditLogEntry, "timestamp"> & { timestamp?: import("firebase-admin").firestore.Timestamp }): Promise<void> {
  const { Timestamp } = getFirestoreExports();
  const ref = getBlogAuditLogsRef().doc();
  await ref.set({
    ...entry,
    timestamp: entry.timestamp ?? Timestamp.now(),
  });
}

/** Remove undefined from object so Firestore accepts it. */
function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/** Save a version snapshot to blogPostVersions/{postId}/versions. */
export async function saveVersionSnapshot(
  postId: string,
  snapshot: Omit<BlogPostVersionSnapshot, "savedAt"> & { savedAt?: import("firebase-admin").firestore.Timestamp }
): Promise<string> {
  const { Timestamp } = getFirestoreExports();
  const seo = snapshot.seo && typeof snapshot.seo === "object"
    ? stripUndefined(snapshot.seo as unknown as Record<string, unknown>)
    : snapshot.seo;
  const ref = getBlogVersionsRef(postId).doc();
  await ref.set({
    ...snapshot,
    seo,
    savedAt: snapshot.savedAt ?? Timestamp.now(),
  });
  return ref.id;
}

/** Get a published post by slug (for public blog page). Returns serialized or null. */
export async function getPublishedPostBySlug(slug: string): Promise<({ id: string } & Record<string, unknown>) | null> {
  const snap = await getBlogPostsRef().where("slug", "==", slug).where("status", "==", "published").limit(1).get();
  const doc = snap.docs[0];
  if (!doc?.exists) return null;
  return toSerializedPost(doc);
}
