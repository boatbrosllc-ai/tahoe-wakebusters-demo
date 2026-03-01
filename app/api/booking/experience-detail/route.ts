/**
 * GET /api/booking/experience-detail?experienceId=...
 *
 * Combined endpoint that returns boats, rates, and add-ons for an experience in a
 * single round-trip. Replaces three sequential calls to /api/booking/boats,
 * /api/experiences/rates, and /api/booking/experience-addons.
 *
 * All three Firestore reads are issued in parallel via Promise.all.
 */
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import type { ListingBoat, ExperienceRate, ExperienceAddon } from "@/lib/booking/types";

export interface ExperienceDetailBoat {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  photos: string[];
  fromPriceCents: number | null;
  rates: { id: string; durationHours: number; displayName: string; priceCents: number }[];
}

export interface ExperienceDetailRate {
  id: string;
  durationHours: number;
  displayName: string;
  priceCents: number;
}

export interface ExperienceDetailAddon {
  id: string;
  name: string;
  description?: string;
  priceCents: number;
  type: string;
  maxQty?: number;
  highlight: boolean;
}

export interface ExperienceDetailResponse {
  boats: ExperienceDetailBoat[];
  rates: ExperienceDetailRate[];
  addons: ExperienceDetailAddon[];
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const experienceId = request.nextUrl.searchParams.get("experienceId");
  if (!experienceId) {
    return NextResponse.json({ error: "experienceId required" }, { status: 400 });
  }

  try {
    const db = getDb();
    const expRef = db.collection("experiences").doc(experienceId);

    const [expDoc, ratesSnap, boatsSnap, addonsSnap] = await Promise.all([
      expRef.get(),
      expRef.collection("rates").where("active", "==", true).get(),
      db
        .collection("boats")
        .where("isListingBoat", "==", true)
        .where("active", "==", true)
        .where("experienceIds", "array-contains", experienceId)
        .get(),
      expRef.collection("addons").where("active", "==", true).get(),
    ]);

    if (!expDoc.exists) {
      return NextResponse.json({ error: "Experience not found" }, { status: 404 });
    }

    // --- Rates ---
    const rates: ExperienceDetailRate[] = ratesSnap.docs
      .filter((d) => typeof (d.data() as ExperienceRate).priceCents === "number")
      .map((d) => {
        const r = d.data() as ExperienceRate;
        return { id: d.id, durationHours: r.durationHours, displayName: r.displayName, priceCents: r.priceCents };
      });

    let fromPriceCents: number | null = null;
    for (const r of rates) {
      if (fromPriceCents == null || r.priceCents < fromPriceCents) fromPriceCents = r.priceCents;
    }

    // --- Boats ---
    // Note: rates is NOT embedded per-boat in the JSON payload — it lives at the top-level
    // ExperienceDetailResponse.rates field. Boats only carry fromPriceCents for display.
    const boats: ExperienceDetailBoat[] = boatsSnap.docs.map((doc) => {
      const boat = doc.data() as ListingBoat;
      return {
        id: doc.id,
        name: boat.name,
        slug: boat.slug,
        description: boat.description,
        photos: boat.photos ?? [],
        fromPriceCents,
        rates, // reference to the shared array — JSON.stringify will duplicate but callers should use top-level rates
      };
    });

    // --- Add-ons (exclude tip type — shown separately as Tip now / Tip later buttons) ---
    const addons: ExperienceDetailAddon[] = addonsSnap.docs
      .map((d) => {
        const a = d.data() as ExperienceAddon;
        return {
          id: d.id,
          name: a.name,
          description: a.description,
          priceCents: a.priceCents,
          type: a.type,
          maxQty: a.maxQty,
          highlight: a.highlight ?? false,
        };
      })
      .filter((a) => a.type !== "tip");

    const payload: ExperienceDetailResponse = { boats, rates, addons };
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (err) {
    console.error("[booking/experience-detail]", err);
    return NextResponse.json(
      {
        error: "Failed to load experience detail",
        detail:
          process.env.NODE_ENV === "development"
            ? err instanceof Error
              ? err.message
              : String(err)
            : undefined,
      },
      { status: 500 }
    );
  }
}
