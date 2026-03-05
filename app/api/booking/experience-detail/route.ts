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

    const expDoc = await expRef.get();
    if (!expDoc.exists) {
      return NextResponse.json({ error: "Experience not found" }, { status: 404 });
    }
    const expData = expDoc.data() as { slug?: string };
    const experienceSlug = typeof expData?.slug === "string" ? expData.slug.trim().toLowerCase() : "";

    // Pontoon experience: boats may be linked by doc id OR by slug ("pontoon" / "lake-austin-pontoon"). Query all and merge.
    const isPontoonSlug = experienceSlug === "pontoon" || experienceSlug === "lake-austin-pontoon";
    const boatsByExpIdPromise = db
      .collection("boats")
      .where("isListingBoat", "==", true)
      .where("active", "==", true)
      .where("experienceIds", "array-contains", experienceId)
      .get();
    const boatsByPontoonPromise = isPontoonSlug
      ? Promise.all([
          db.collection("boats").where("isListingBoat", "==", true).where("active", "==", true).where("experienceIds", "array-contains", "pontoon").get(),
          db.collection("boats").where("isListingBoat", "==", true).where("active", "==", true).where("experienceIds", "array-contains", "lake-austin-pontoon").get(),
        ])
      : Promise.resolve([]);

    const [ratesSnap, boatsSnapById, boatsBySlugSnaps, addonsSnap] = await Promise.all([
      expRef.collection("rates").where("active", "==", true).get(),
      boatsByExpIdPromise,
      boatsByPontoonPromise,
      expRef.collection("addons").where("active", "==", true).get(),
    ]);

    const allBoatDocs = [...boatsSnapById.docs];
    if (isPontoonSlug && Array.isArray(boatsBySlugSnaps)) {
      const seen = new Set(allBoatDocs.map((d) => d.id));
      for (const snap of boatsBySlugSnaps) {
        snap.docs.forEach((d: { id: string }) => {
          if (!seen.has(d.id)) {
            seen.add(d.id);
            allBoatDocs.push(d as (typeof allBoatDocs)[number]);
          }
        });
      }
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
    // Filter by boatType so Watersports shows only wake boats and Pontoon shows only pontoon/tritoon
    // (guards against production data linking the wrong boat types to an experience).
    const boatTypeForSlug = (slug: string): ((bt: string | undefined) => boolean) => {
      const s = (slug ?? "").toLowerCase().trim();
      if (
        s === "watersports" ||
        s === "wake-surf" ||
        s === "lake-austin-wake-boat" ||
        s === "wake" ||
        s === "wakeboard" ||
        s === "wake-board"
      )
        return (bt) => bt === "wake";
      // Pontoon: allow pontoon/tritoon; also allow missing boatType so boats assigned to the listing but without type set still appear.
      if (s === "pontoon" || s === "lake-austin-pontoon") return (bt) => !bt || bt === "pontoon" || bt === "tritoon";
      return () => true; // sunset, holiday: no filter
    };
    const allowBoatType = boatTypeForSlug(experienceSlug);
    const boats: ExperienceDetailBoat[] = allBoatDocs
      .filter((doc) => {
        const boat = doc.data() as ListingBoat;
        return allowBoatType(boat.boatType);
      })
      .map((doc) => {
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
