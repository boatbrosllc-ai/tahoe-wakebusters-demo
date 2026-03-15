import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { hasFirebaseConfig } from "@/lib/booking/env";
import { getSlugLookupCandidates } from "@/lib/booking/experience-aliases";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
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
      return NextResponse.json(
        {
          error: "Booking is not configured. Set Firebase env vars (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) in your host.",
          hint: "Configure Firebase in your deployment environment to load experience data.",
          code: "FIREBASE_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }
    const db = getDb();
    const normalizedSlug = slug.trim().toLowerCase();
    const candidates = getSlugLookupCandidates(normalizedSlug);
    let expSnap = null;
    for (const candidate of candidates) {
      expSnap = await db.collection("experiences").where("slug", "==", candidate).where("active", "==", true).limit(1).get();
      if (!expSnap.empty) break;
    }
    if (!expSnap || expSnap.empty) {
      return NextResponse.json(
        { error: "Experience not found", hint: "No active experience matches this slug." },
        { status: 404 }
      );
    }
    const doc = expSnap.docs[0];
    const raw = doc.data() as Experience;
    const experience = {
      ...raw,
      id: doc.id,
      maxGuests: getMaxGuestsForExperience({
        slug: raw.slug,
        title: raw.title,
        maxGuests: raw.maxGuests,
        pricingType: raw.pricingType,
        maxCapacity: raw.maxCapacity,
      }),
    } as Experience & { id: string };
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
      experience: { ...experience, id: undefined } as Experience,
      rates,
      addons,
    };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isConfigMissing =
      message.includes("Firebase config missing") ||
      message.includes("FIREBASE_PRIVATE_KEY is truncated") ||
      message.includes("Missing required env");
    console.error("[experiences/[slug]]", err);
    if (isConfigMissing) {
      return NextResponse.json(
        {
          error: "Booking is not configured. Set Firebase env vars (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) in your host.",
          hint: "Configure Firebase in your deployment environment to load experience data.",
          code: "FIREBASE_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        error: "Failed to load experience",
        hint: process.env.NODE_ENV === "development" ? message : undefined,
      },
      { status: 500 }
    );
  }
}
