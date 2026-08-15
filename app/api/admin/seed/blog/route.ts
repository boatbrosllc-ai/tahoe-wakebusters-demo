/**
 * Seed Firestore blogPosts with the six SEO cluster articles (published + schema).
 * Requires admin session and ENABLE_SEED_ENDPOINT=true (same guard as /api/admin/seed).
 *
 * POST /api/admin/seed/blog
 * Body (optional): { confirmPhrase?: string, overwrite?: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { requireSeedConfirmPhrase } from "@/lib/admin-destructive-confirm";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getBlogPostsRef, writeAuditLog } from "@/lib/blog/firestore";
import { CMS_BLOG_POST_SEEDS } from "@/lib/blog/cms-posts";
import { buildPublishedPostDoc } from "@/lib/blog/cms-posts/build-doc";

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v !== undefined) out[key] = v;
  }
  return out;
}

export async function POST(request: NextRequest) {
  const deny = await requireAdminSession(request.headers.get("cookie"));
  if (deny) return deny;

  const seedEnabled = process.env.ENABLE_SEED_ENDPOINT === "true";
  if (!seedEnabled) {
    return NextResponse.json(
      { error: "Seed endpoints are disabled. Set ENABLE_SEED_ENDPOINT=true to enable." },
      { status: 403 }
    );
  }

  let body: { confirmPhrase?: string; overwrite?: boolean } = {};
  try {
    body = (await request.json().catch(() => ({}))) as typeof body;
  } catch {
    body = {};
  }

  const confirmDeny = requireSeedConfirmPhrase(body.confirmPhrase);
  if (confirmDeny) return confirmDeny;

  const overwrite = body.overwrite === true;
  const { Timestamp } = getFirestoreExports();
  const now = Timestamp.now();
  const results: { slug: string; id: string; action: "created" | "updated" | "skipped" }[] = [];

  try {
    const col = getBlogPostsRef();

    for (const seed of CMS_BLOG_POST_SEEDS) {
      const existing = await col.where("slug", "==", seed.slug).limit(1).get();
      const doc = buildPublishedPostDoc(seed, {
        createdAt: now,
        updatedAt: now,
        lastPublishedAt: now,
      });

      const payload = stripUndefined(doc as unknown as Record<string, unknown>);

      if (!existing.empty) {
        const ref = existing.docs[0].ref;
        if (!overwrite) {
          results.push({ slug: seed.slug, id: ref.id, action: "skipped" });
          continue;
        }
        const prev = existing.docs[0].data();
        const createdAt = prev.createdAt ?? now;
        const updated = buildPublishedPostDoc(seed, {
          createdAt: createdAt as import("firebase-admin").firestore.Timestamp,
          updatedAt: now,
          lastPublishedAt: now,
        });
        await ref.set(
          stripUndefined({
            ...updated,
            revision: ((prev.revision as number) ?? 1) + 1,
          } as unknown as Record<string, unknown>),
          { merge: false }
        );
        await writeAuditLog({ actorUid: null, action: "publish", postId: ref.id, diffSummary: "seed blog overwrite" });
        results.push({ slug: seed.slug, id: ref.id, action: "updated" });
        continue;
      }

      const ref = col.doc();
      await ref.set(payload);
      await writeAuditLog({ actorUid: null, action: "create", postId: ref.id, diffSummary: `seed blog: ${seed.slug}` });
      results.push({ slug: seed.slug, id: ref.id, action: "created" });
    }

    return NextResponse.json({ ok: true, count: CMS_BLOG_POST_SEEDS.length, results });
  } catch (err) {
    console.error("[admin/seed/blog]", err);
    return NextResponse.json({ error: "Blog seed failed" }, { status: 500 });
  }
}
