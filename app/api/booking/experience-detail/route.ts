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
import { safeHasFirebaseConfig, getFirebaseConfigStatus } from "@/lib/booking/env";
import { getExperienceIdVariants, allowBoatTypeForSlug, inferSlugFromTitle, getSlugForBoatTypeFilter, isWatersportsSlug, inferSlugFromAssignedBoats, isTicketedExperienceSlug } from "@/lib/booking/experience-aliases";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
import type { ListingBoat, ExperienceRate, ExperienceAddon } from "@/lib/booking/types";

const EXPERIENCE_DETAIL_FIREBASE_HINT =
  "Experience detail requires Firebase. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in your deployment environment.";

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
  pricingType?: "charter" | "ticketed";
  maxGuests?: number;
  maxCapacity?: number;
  departureHour?: number;
  departureMinute?: number;
  allowDeposit?: boolean;
  allowTipNow?: boolean;
  allowTipLater?: boolean;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const experienceId = request.nextUrl.searchParams.get("experienceId");
  if (!experienceId) {
    return NextResponse.json({ error: "experienceId required" }, { status: 400 });
  }

  if (!safeHasFirebaseConfig()) {
    const detail = (() => {
      try {
        return getFirebaseConfigStatus();
      } catch {
        return { summary: EXPERIENCE_DETAIL_FIREBASE_HINT };
      }
    })();
    return NextResponse.json(
      { error: "Booking is not configured.", hint: EXPERIENCE_DETAIL_FIREBASE_HINT, firebaseDetail: detail },
      { status: 503 }
    );
  }

  try {
    const db = getDb();
    const expRef = db.collection("experiences").doc(experienceId);

    const expDoc = await expRef.get();
    if (!expDoc.exists) {
      return NextResponse.json({ error: "Experience not found" }, { status: 404 });
    }
    const expData = expDoc.data() as { slug?: string; title?: string; name?: string; pricingType?: "charter" | "ticketed"; maxGuests?: number; maxCapacity?: number; departureHour?: number; departureMinute?: number; allowDeposit?: boolean; allowTipNow?: boolean; allowTipLater?: boolean };
    const experienceSlug = typeof expData?.slug === "string" ? expData.slug.trim().toLowerCase() : "";
    const inferredSlugFromTitle = inferSlugFromTitle(expData?.title ?? expData?.name);
    const effectiveSlug = experienceSlug || inferredSlugFromTitle;
    const isTicketedInferred = isTicketedExperienceSlug(effectiveSlug) && expData?.pricingType !== "charter";
    const pricingType = expData?.pricingType === "ticketed" || isTicketedInferred ? "ticketed" as const : (expData?.pricingType ?? undefined);
    const slugForBoatType = getSlugForBoatTypeFilter(experienceSlug, inferredSlugFromTitle, experienceId ?? "", expData?.title ?? expData?.name);

    // Boats may be linked by doc id or any canonical slug alias (e.g. pontoon / lake-austin-pontoon). Query by each variant and merge.
    const experienceIdVariants = getExperienceIdVariants(experienceId, effectiveSlug);
    const boatPromises = experienceIdVariants.map((variantId) =>
      db
        .collection("boats")
        .where("isListingBoat", "==", true)
        .where("active", "==", true)
        .where("experienceIds", "array-contains", variantId)
        .get()
    );

    const [ratesSnap, addonsSnap, ...boatsSnapsByVariant] = await Promise.all([
      expRef.collection("rates").where("active", "==", true).get(),
      expRef.collection("addons").where("active", "==", true).get(),
      ...boatPromises,
    ]);

    const allBoatDocs: import("firebase-admin").firestore.QueryDocumentSnapshot[] = [];
    const seen = new Set<string>();
    for (const snap of boatsSnapsByVariant) {
      for (const d of snap.docs) {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          allBoatDocs.push(d);
        }
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
    // When slug/title don't identify the listing (e.g. doc id only), infer from assigned boats so we never show pontoon on wake listing.
    const slugEffective = inferSlugFromAssignedBoats(slugForBoatType, allBoatDocs);
    // Filter by boatType so Watersports shows only wake boats and Pontoon shows only pontoon/tritoon
    const allowBoatType = allowBoatTypeForSlug(slugEffective);
    let boatDocsFiltered = allBoatDocs.filter((doc) => {
      const boat = doc.data() as ListingBoat;
      return allowBoatType(boat.boatType);
    });
    // Hard guarantee: watersports must never show pontoon/tritoon — only wake boats.
    if (isWatersportsSlug(slugEffective)) {
      boatDocsFiltered = boatDocsFiltered.filter(
        (doc) => ((doc.data() as ListingBoat).boatType ?? "").toLowerCase().trim() === "wake"
      );
    }
    const boats: ExperienceDetailBoat[] = [...boatDocsFiltered]
      .sort((a, b) => a.id.localeCompare(b.id))
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

    const payload: ExperienceDetailResponse = {
      boats,
      rates,
      addons,
      ...(pricingType && { pricingType }),
      maxGuests: getMaxGuestsForExperience({
        slug: expData?.slug,
        title: expData?.title ?? expData?.name,
        maxGuests: expData?.maxGuests,
        pricingType: pricingType ?? "charter",
        maxCapacity: expData?.maxCapacity,
      }),
      ...(pricingType === "ticketed" && { maxCapacity: expData?.maxCapacity ?? 35, departureHour: expData?.departureHour ?? 19, departureMinute: expData?.departureMinute ?? 0 }),
      // Charters require explicit opt-in for deposit (match create-payment-intent); ticketed never
      allowDeposit: pricingType === "ticketed" ? false : expData?.allowDeposit === true,
      allowTipNow: expData?.allowTipNow !== false,
      allowTipLater: expData?.allowTipLater !== false,
    };
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" },
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
