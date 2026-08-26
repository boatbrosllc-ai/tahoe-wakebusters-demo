import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import {
  getBlogPostRef,
  getBlogVersionsRef,
  writeAuditLog,
  toSerializedPost,
} from "@/lib/blog/firestore";
import { computeContentStats } from "@/lib/blog/content-stats";
import { buildSchemaFields } from "@/lib/blog/schema-jsonld";
import type { ContentBlock } from "@/lib/blog/types";
import { requireFeatureResponse } from "@/lib/plan";

/** POST /api/admin/blog/[postId]/restore — restore from a version snapshot */
export async function POST(
  request: NextRequest,
  {
  params }: { params: Promise<{ postId: string }> }
) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("blogStudio");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { postId } = await params;
  if (!postId) {
    return NextResponse.json({ error: "Missing postId" }, { status: 400 });
  }

  let body: { versionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const versionId = body.versionId;
  if (!versionId || typeof versionId !== "string") {
    return NextResponse.json({ error: "versionId required" }, { status: 400 });
  }

  const postRef = getBlogPostRef(postId);
  const postDoc = await postRef.get();
  if (!postDoc.exists) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const versionRef = getBlogVersionsRef(postId).doc(versionId);
  const versionDoc = await versionRef.get();
  if (!versionDoc.exists) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 });
  }

  const versionData = versionDoc.data() as {
    title?: string;
    slug?: string;
    content?: ContentBlock[];
    contentText?: string;
    seo?: Record<string, unknown>;
    status?: string;
  };

  const content = (versionData.content ?? []) as ContentBlock[];
  const contentText = (versionData.contentText ?? "").trim()
    ? versionData.contentText
    : content.map((b) => {
        if (b.type === "paragraph") return (b as { content?: string }).content ?? "";
        if (b.type === "heading") return (b as { content?: string }).content ?? "";
        return "";
      }).join(" ");

  const { Timestamp } = getFirestoreExports();
  const stats = computeContentStats(content);
  const postData = postDoc.data() as Record<string, unknown>;
  const merged: Record<string, unknown> = {
    ...postData,
    title: versionData.title ?? postData.title,
    slug: versionData.slug ?? postData.slug,
    content,
    contentText: contentText || (versionData.contentText ?? ""),
    seo: versionData.seo ?? postData.seo,
    status: versionData.status ?? postData.status,
    updatedAt: Timestamp.now(),
    updatedByUid: null,
    revision: ((postData.revision as number) ?? 1) + 1,
  };
  const schemaFields = buildSchemaFields({
    ...merged,
    author: (merged.author ?? { name: "" }) as { name: string },
    coverImage: (merged.coverImage ?? null) as { url?: string; alt?: string } | null,
    ogImage: (merged.ogImage ?? null) as { url?: string } | null,
    excerpt: (merged.excerpt ?? "") as string,
    seo: (merged.seo ?? { metaTitle: "", metaDescription: "", robotsIndex: true, robotsFollow: true }) as import("@/lib/blog/types").BlogPostDoc["seo"],
    publishAt: merged.publishAt,
    lastPublishedAt: merged.lastPublishedAt,
    updatedAt: merged.updatedAt,
  } as unknown as import("@/lib/blog/types").BlogPostDoc);

  await postRef.update({
    title: merged.title,
    slug: merged.slug,
    content: merged.content,
    contentText: merged.contentText,
    seo: merged.seo,
    status: merged.status,
    stats,
    schema: { ...schemaFields },
    updatedAt: merged.updatedAt,
    updatedByUid: merged.updatedByUid,
    revision: merged.revision,
  });

  await writeAuditLog({
    actorUid: null,
    action: "restore_version",
    postId,
    diffSummary: `Restored version ${versionId} (rev ${merged.revision})`,
  });

  const updated = await postRef.get();
  return NextResponse.json(toSerializedPost(updated));
}
