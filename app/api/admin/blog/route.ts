import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getBlogPostsRef, getBlogPostRef, buildNewPostDoc, toSerializedPost, writeAuditLog } from "@/lib/blog/firestore";
import { createBlogPostSchema } from "@/lib/blog/schema";
import { contentBlocksToText } from "@/lib/blog/content-stats";
import { blogPosts } from "@/content/blog";
import { requireFeatureResponse } from "@/lib/plan";

/** GET /api/admin/blog — list posts with optional search, status, sort. Includes static "The Dock" posts from content/blog so Blog Studio shows all current articles. */
export async function GET(request: NextRequest) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("blogStudio");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") || undefined;
  const search = searchParams.get("search")?.trim() || undefined;
  const sort = searchParams.get("sort") || "updatedAt";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 100);

  try {
    let firestoreList: ({ id: string } & Record<string, unknown>)[] = [];
    try {
      let q = getBlogPostsRef().orderBy(sort === "publishAt" ? "publishAt" : "updatedAt", "desc").limit(limit);
      if (status) {
        q = getBlogPostsRef().where("status", "==", status).orderBy("updatedAt", "desc").limit(limit);
      }
      const snap = await q.get();
      firestoreList = snap.docs.map((doc) => toSerializedPost(doc)).filter(Boolean) as ({ id: string } & Record<string, unknown>)[];
    } catch (firestoreErr) {
      console.warn("[admin/blog] Firestore list failed, continuing with static posts only:", firestoreErr);
    }

    const firestoreSlugs = new Set(firestoreList.map((p) => (p.slug as string)?.trim()).filter(Boolean));
    const staticItems = blogPosts.map((p) => ({
      id: `static-${p.slug}`,
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt ?? "",
      status: "published",
      source: "static",
      publishAt: p.date ? new Date(p.date).toISOString() : null,
      updatedAt: (p.dateModified ?? p.date) ? new Date(p.dateModified ?? p.date!).toISOString() : new Date(0).toISOString(),
      createdAt: p.date ? new Date(p.date).toISOString() : new Date(0).toISOString(),
      coverImage: p.image ? { url: p.image, alt: p.imageAlt ?? "" } : null,
    })) as ({ id: string } & Record<string, unknown>)[];
    const staticOnly = staticItems.filter((s) => !firestoreSlugs.has((s.slug as string)?.trim()));
    let list = [...firestoreList, ...staticOnly].sort((a, b) => {
      const aVal = (sort === "publishAt" ? (a.publishAt as string) : (a.updatedAt as string)) ?? "";
      const bVal = (sort === "publishAt" ? (b.publishAt as string) : (b.updatedAt as string)) ?? "";
      return bVal.localeCompare(aVal);
    });
    list = list.slice(0, limit);

    if (search) {
      const lower = search.toLowerCase();
      list = list.filter(
        (p) =>
          (typeof p.title === "string" && p.title.toLowerCase().includes(lower)) ||
          (typeof p.slug === "string" && p.slug.toLowerCase().includes(lower)) ||
          (typeof p.contentText === "string" && p.contentText.toLowerCase().includes(lower)) ||
          (typeof p.excerpt === "string" && p.excerpt.toLowerCase().includes(lower))
      );
    }
    if (status) {
      list = list.filter((p) => (p.status as string) === status);
    }
    return NextResponse.json({ posts: list });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Recursively remove undefined values so Firestore accepts the document. */
function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(stripUndefinedDeep).filter((v) => v !== undefined);
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const cleaned = stripUndefinedDeep(v);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }
  return value;
}

/** POST /api/admin/blog — create a new draft post. */
export async function POST(request: NextRequest) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("blogStudio");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createBlogPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const { title, slug, excerpt, content, author, taxonomy } = parsed.data;

  try {
    const col = getBlogPostsRef();
    const slugCheck = await col.where("slug", "==", slug).limit(1).get();
    if (!slugCheck.empty) {
      return NextResponse.json({ error: "Slug already in use", field: "slug" }, { status: 409 });
    }
    const newRef = col.doc();
    const contentBlocks = (content ?? []) as import("@/lib/blog/types").ContentBlock[];
    const rawDoc = buildNewPostDoc({
      title,
      slug,
      excerpt,
      content: contentBlocks,
      contentText: contentBlocksToText(contentBlocks),
      author,
      taxonomy,
      createdByUid: null,
    });
    const doc = stripUndefinedDeep(rawDoc) as typeof rawDoc;
    await newRef.set(doc);
    await writeAuditLog({ actorUid: null, action: "create", postId: newRef.id, diffSummary: `Created: ${title}` });
    const created = await newRef.get();
    return NextResponse.json(toSerializedPost(created) ?? { id: newRef.id, ...doc });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

