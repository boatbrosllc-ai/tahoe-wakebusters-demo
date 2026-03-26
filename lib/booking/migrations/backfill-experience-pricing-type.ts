import { getDb } from "@/lib/booking/firebase-admin";
import { resolveExperiencePricingType } from "@/lib/booking/experience-aliases";

/**
 * One-time data migration: ensures every experience has explicit pricingType.
 * Run from a controlled admin script/runtime, not from public request handlers.
 */
export async function backfillExperiencePricingType(): Promise<{
  scanned: number;
  updated: number;
}> {
  const db = getDb();
  const snap = await db.collection("experiences").get();
  const batch = db.batch();
  let scanned = 0;
  let updated = 0;
  for (const doc of snap.docs) {
    scanned++;
    const data = doc.data() as {
      pricingType?: "charter" | "ticketed";
      slug?: string;
      title?: string;
      name?: string;
    };
    if (data.pricingType === "charter" || data.pricingType === "ticketed") continue;
    const resolved = resolveExperiencePricingType({
      slug: data.slug,
      title: data.title,
      name: data.name,
    });
    batch.set(doc.ref, { pricingType: resolved }, { merge: true });
    updated++;
  }
  if (updated > 0) await batch.commit();
  return { scanned, updated };
}
