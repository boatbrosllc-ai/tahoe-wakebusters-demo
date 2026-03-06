import "server-only";
import { getDb } from "@/lib/booking/firebase-admin";
import { getSlugLookupCandidates } from "@/lib/booking/experience-aliases";
import type { Experience, ExperienceRate, ExperienceAddon } from "./types";

export interface ExperienceWithDetails {
  id: string;
  experience: Experience;
  rates: { id: string; durationHours: number; displayName: string; priceCents: number; priceWeekendCents?: number; priceHolidayCents?: number; active: boolean }[];
  addons: { id: string; name: string; description?: string; priceCents: number; type: "toggle" | "quantity" | "tip"; active: boolean; maxQty?: number }[];
}

export async function getExperienceBySlug(slug: string): Promise<ExperienceWithDetails | null> {
  const db = getDb();
  const normalizedSlug = slug.trim().toLowerCase();
  const candidates = getSlugLookupCandidates(normalizedSlug);
  let snap = null;
  for (const candidate of candidates) {
    snap = await db.collection("experiences").where("slug", "==", candidate).where("active", "==", true).limit(1).get();
    if (!snap.empty) break;
  }
  if (!snap || snap.empty) return null;
  const doc = snap.docs[0];
  const experience = doc.data() as Experience;
  const ratesSnap = await db.collection("experiences").doc(doc.id).collection("rates").where("active", "==", true).get();
  const rates = ratesSnap.docs.map((r) => {
    const d = r.data() as ExperienceRate;
    return {
      id: r.id,
      durationHours: d.durationHours,
      displayName: d.displayName,
      priceCents: d.priceCents,
      priceWeekendCents: d.priceWeekendCents,
      priceHolidayCents: d.priceHolidayCents,
      active: d.active,
    };
  });
  const addonsSnap = await db.collection("experiences").doc(doc.id).collection("addons").where("active", "==", true).get();
  const addons = addonsSnap.docs.map((a) => {
    const d = a.data() as ExperienceAddon;
    return { id: a.id, name: d.name, description: d.description, priceCents: d.priceCents, type: d.type, active: d.active, maxQty: d.maxQty };
  });
  return {
    id: doc.id,
    experience,
    rates,
    addons,
  };
}
