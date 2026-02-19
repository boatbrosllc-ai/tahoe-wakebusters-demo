import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getBlogVersionsRef } from "@/lib/blog/firestore";

function toIso(t: { seconds: number; nanoseconds: number } | null | undefined): string | null {
  if (!t || typeof t !== "object") return null;
  return new Date(t.seconds * 1000 + t.nanoseconds / 1e6).toISOString();
}

/** GET /api/admin/blog/[postId]/versions — list version snapshots for this post */
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
    const snap = await getBlogVersionsRef(postId).orderBy("savedAt", "desc").limit(50).get();
    const versions = snap.docs.map((doc) => {
      const d = doc.data();
      const savedAt = d.savedAt as { seconds: number; nanoseconds: number } | undefined;
      return {
        id: doc.id,
        savedAt: toIso(savedAt),
        savedByUid: d.savedByUid ?? null,
        revision: d.revision ?? 0,
        title: d.title ?? "",
        slug: d.slug ?? "",
      };
    });
    return NextResponse.json({ versions });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
