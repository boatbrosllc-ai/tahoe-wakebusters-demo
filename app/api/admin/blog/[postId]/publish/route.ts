import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getBlogPostRef, writeAuditLog } from "@/lib/blog/firestore";
import { publishBlogPostSchema, validatePublishRequirements } from "@/lib/blog/schema";
import { buildSchemaFields } from "@/lib/blog/schema-jsonld";

/** POST /api/admin/blog/[postId]/publish — publish_now | schedule | unpublish | archive */
export async function POST(
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

  const parsed = publishBlogPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const ref = getBlogPostRef(postId);
  const doc = await ref.get();
  if (!doc.exists) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const data = doc.data() as Record<string, unknown>;
  const { action, publishAt: publishAtStr } = parsed.data;

  if (action === "publish_now" || action === "schedule") {
    const validation = validatePublishRequirements({
      title: data.title as string,
      slug: data.slug as string,
      seo: data.seo as { metaTitle?: string; metaDescription?: string },
      coverImage: data.coverImage as { alt?: string } | null,
      content: data.content as { type: string; content?: string }[],
    });
    if (!validation.valid) {
      return NextResponse.json({ error: "Publish validation failed", errors: validation.errors }, { status: 400 });
    }
  }

  const { Timestamp } = getFirestoreExports();
  const update: Record<string, unknown> = {
    updatedAt: Timestamp.now(),
    updatedByUid: null,
  };

  switch (action) {
    case "publish_now":
      update.status = "published";
      update.publishAt = null;
      update.lastPublishedAt = Timestamp.now();
      break;
    case "schedule":
      if (!publishAtStr) {
        return NextResponse.json({ error: "publishAt required for schedule" }, { status: 400 });
      }
      update.status = "scheduled";
      update.publishAt = Timestamp.fromDate(new Date(publishAtStr));
      break;
    case "unpublish":
      update.status = "draft";
      update.publishAt = null;
      break;
    case "archive":
      update.status = "archived";
      break;
    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const serialized = {
    ...data,
    ...update,
    publishAt: update.publishAt ?? data.publishAt,
    lastPublishedAt: update.lastPublishedAt ?? data.lastPublishedAt,
    updatedAt: update.updatedAt,
  };
  const schemaFields = buildSchemaFields({
    ...(serialized as Record<string, unknown>),
    seo: data.seo as import("@/lib/blog/types").BlogPostDoc["seo"],
  } as import("@/lib/blog/types").BlogPostDoc);
  update.schema = schemaFields;

  await ref.update(update);

  const auditAction =
    action === "publish_now" ? "publish" as const
    : action === "schedule" ? "schedule" as const
    : action === "unpublish" ? "unpublish" as const
    : "archive" as const;
  await writeAuditLog({
    actorUid: null,
    action: auditAction,
    postId,
    diffSummary: action === "schedule" ? `Scheduled for ${publishAtStr}` : action,
  });

  const updated = await ref.get();
  const out = updated.data();
  const toIso = (t: unknown): string | null => {
    if (!t || typeof t !== "object" || !("seconds" in t)) return null;
    return new Date((t as { seconds: number }).seconds * 1000).toISOString();
  };
  return NextResponse.json({
    id: updated.id,
    ...out,
    publishAt: out?.publishAt ? toIso(out.publishAt) : null,
    lastPublishedAt: out?.lastPublishedAt ? toIso(out.lastPublishedAt) : null,
    createdAt: out?.createdAt ? toIso(out.createdAt) : null,
    updatedAt: out?.updatedAt ? toIso(out.updatedAt) : null,
  });
}
