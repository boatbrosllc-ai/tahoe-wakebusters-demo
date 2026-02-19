import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import {
  getBlogPostRef,
  getBlogPostsRef,
  toSerializedPost,
  writeAuditLog,
  saveVersionSnapshot,
} from "@/lib/blog/firestore";
import { updateBlogPostSchema } from "@/lib/blog/schema";
import type { ContentBlock } from "@/lib/blog/types";

/** Remove undefined values from an object so Firestore accepts it. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/** GET /api/admin/blog/[postId] — get one post. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const unauthorized = await requireAdminSession(_request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { postId } = await params;
  if (!postId) {
    return NextResponse.json({ error: "Missing postId" }, { status: 400 });
  }

  try {
    const doc = await getBlogPostRef(postId).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    return NextResponse.json(toSerializedPost(doc));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PATCH /api/admin/blog/[postId] — save (draft) update. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> }
) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { postId } = await params;
  if (!postId) {
    return NextResponse.json({ error: "Missing postId" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateBlogPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const ref = getBlogPostRef(postId);
  const existing = await ref.get();
  if (!existing.exists) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const data = existing.data() as Record<string, unknown>;
  const currentSlug = data?.slug as string | undefined;
  if (parsed.data.slug !== undefined && parsed.data.slug !== currentSlug) {
    const slugCheck = await getBlogPostsRef().where("slug", "==", parsed.data.slug).limit(1).get();
    const conflict = slugCheck.docs.find((d) => d.id !== postId);
    if (conflict) {
      return NextResponse.json({ error: "Slug already in use", field: "slug" }, { status: 409 });
    }
  }

  try {
    const { FieldValue, Timestamp } = getFirestoreExports();
    const update: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
      updatedByUid: null,
    };

    const allowed = [
      "title", "slug", "excerpt", "coverImage", "ogImage", "content", "contentText",
      "seo", "schema", "author", "taxonomy", "stats", "status", "publishAt",
    ] as const;
    for (const key of allowed) {
      const v = parsed.data[key as keyof typeof parsed.data];
      if (v === undefined) continue;
      if (key === "publishAt" && v !== null) {
        try {
          update[key] = Timestamp.fromDate(new Date(v as string));
        } catch {
          update[key] = null;
        }
      } else if (key === "seo" && v !== null && typeof v === "object") {
        (update as Record<string, unknown>)[key] = stripUndefined(v as Record<string, unknown>);
      } else {
        (update as Record<string, unknown>)[key] = v;
      }
    }

    const nextRev = ((data?.revision as number) ?? 1) + 1;
    update.revision = nextRev;

    await ref.update(update);

    const content = (parsed.data.content ?? data?.content) as ContentBlock[] | undefined;
    await saveVersionSnapshot(postId, {
      savedByUid: null,
      revision: nextRev,
      title: (parsed.data.title ?? data?.title) as string,
      slug: (parsed.data.slug ?? data?.slug) as string,
      content: content ?? [],
      contentText: (parsed.data.contentText ?? data?.contentText) as string,
      seo: (parsed.data.seo ?? data?.seo) as import("@/lib/blog/types").BlogSeo,
      status: (parsed.data.status ?? data?.status) as import("@/lib/blog/types").BlogPostStatus,
    });
    await writeAuditLog({
      actorUid: null,
      action: "save",
      postId,
      diffSummary: `Saved rev ${nextRev}`,
    });

    const updated = await ref.get();
    return NextResponse.json(toSerializedPost(updated));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
