import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { hasFirebaseConfig } from "@/lib/booking/env";
import type { Experience, ExperienceRate, ExperienceAddon } from "@/lib/booking/types";

export interface ExperienceDetailResponse {
  id: string;
  experience: Experience;
  rates: { id: string; durationHours: number; displayName: string; priceCents: number; active: boolean }[];
  addons: { id: string; name: string; description?: string; priceCents: number; type: "toggle" | "quantity" | "tip"; active: boolean; maxQty?: number }[];
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    if (!slug) {
      return NextResponse.json({ error: "slug required" }, { status: 400 });
    }
    if (!hasFirebaseConfig()) {
      return NextResponse.json({});
    }
    const db = getDb();
    const normalizedSlug = slug.trim().toLowerCase();
    let expSnap = await db.collection("experiences").where("slug", "==", normalizedSlug).where("active", "==", true).limit(1).get();
    // Pontoon is referenced as "pontoon" in code (e.g. firestoreSlug) but may be stored as "lake-austin-pontoon" in Firestore (URL slug).
    if (expSnap.empty && (normalizedSlug === "pontoon" || normalizedSlug === "lake-austin-pontoon")) {
      const fallbackSlug = normalizedSlug === "pontoon" ? "lake-austin-pontoon" : "pontoon";
      expSnap = await db.collection("experiences").where("slug", "==", fallbackSlug).where("active", "==", true).limit(1).get();
    }
    if (expSnap.empty) {
      // 200 + empty so clients get no 404 in console; they check data?.id for fallback UI
      return NextResponse.json({});
    }
    const doc = expSnap.docs[0];
    const experience = { ...doc.data(), id: doc.id } as Experience & { id: string };
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
    const response: ExperienceDetailResponse = {
      id: doc.id,
      experience: { ...experience, id: undefined },
      rates,
      addons,
    };
    return NextResponse.json(response);
  } catch (err) {
    console.error("[experiences/[slug]]", err);
    return NextResponse.json({});
  }
}
