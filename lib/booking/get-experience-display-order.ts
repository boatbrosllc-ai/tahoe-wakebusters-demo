import "server-only";
import { getDb } from "@/lib/booking/firebase-admin";
import type { Experience } from "@/lib/booking/types";
import { resolveCanonicalExperienceSlug } from "@/lib/booking/experience-aliases";

/** Returns canonical experience slugs in display order for the experiences hub. */
export async function getExperienceDisplayOrder(): Promise<string[]> {
  const db = getDb();
  const snap = await db.collection("experiences").get();
  const items: { slug: string; sortOrder: number }[] = snap.docs
    .map((d) => {
      const exp = d.data() as Experience;
      const raw = (exp.slug ?? "").trim();
      if (!raw) return null;
      return {
        slug: resolveCanonicalExperienceSlug(raw, raw),
        sortOrder: exp.sortOrder ?? 999,
      };
    })
    .filter((x): x is { slug: string; sortOrder: number } => x !== null);
  items.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.slug.localeCompare(b.slug);
  });
  const seen = new Set<string>();
  const order: string[] = [];
  for (const item of items) {
    if (seen.has(item.slug)) continue;
    seen.add(item.slug);
    order.push(item.slug);
  }
  return order;
}
