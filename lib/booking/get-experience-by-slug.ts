import "server-only";
import { getDb } from "@/lib/booking/firebase-admin";
import type { Experience, ExperienceRate, ExperienceAddon } from "./types";

export interface ExperienceWithDetails {
  id: string;
  experience: Experience;
  rates: { id: string; durationHours: number; displayName: string; priceCents: number; active: boolean }[];
  addons: { id: string; name: string; description?: string; priceCents: number; type: "toggle" | "quantity" | "tip"; active: boolean; maxQty?: number }[];
}

async function debugLog(message: string, data: Record<string, unknown>) {
  try {
    await fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location: "get-experience-by-slug.ts", message, data, timestamp: Date.now() }),
    });
  } catch {
    // ignore
  }
}

export async function getExperienceBySlug(slug: string): Promise<ExperienceWithDetails | null> {
  // #region agent log
  await debugLog("getExperienceBySlug entry", { slug, hypothesisId: "H1" });
  // #endregion
  const db = getDb();
  const snap = await db.collection("experiences").where("slug", "==", slug).where("active", "==", true).limit(1).get();
  // #region agent log
  await debugLog("Firestore query result", { empty: snap.empty, size: snap.size, hypothesisId: "H2" });
  // #endregion
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const experience = doc.data() as Experience;
  const ratesSnap = await db.collection("experiences").doc(doc.id).collection("rates").where("active", "==", true).get();
  const rates = ratesSnap.docs.map((r) => {
    const d = r.data() as ExperienceRate;
    return { id: r.id, durationHours: d.durationHours, displayName: d.displayName, priceCents: d.priceCents, active: d.active };
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
