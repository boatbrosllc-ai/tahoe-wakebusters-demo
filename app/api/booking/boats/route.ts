/**
 * GET /api/booking/boats?experienceId=... — list boats assigned to an experience (for booking flow).
 * Boats are for availability only (e.g. which pontoon). Rates and pricing come from the experience (listing).
 */
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import type { ListingBoat, ExperienceRate } from "@/lib/booking/types";

function isWatersportsSlug(slug: string): boolean {
  const s = (slug ?? "").toLowerCase().trim();
  return (
    s === "watersports" ||
    s === "wake-surf" ||
    s === "lake-austin-wake-boat" ||
    s === "wake" ||
    s === "wakeboard" ||
    s === "wake-board"
  );
}

function allowBoatTypeForSlug(slug: string, boatType: string | undefined): boolean {
  if (isWatersportsSlug(slug)) return boatType === "wake";
  // Pontoon: allow pontoon/tritoon; also allow missing boatType so boats assigned to the listing still appear.
  const slugLower = (slug ?? "").toLowerCase().trim();
  if (slugLower === "pontoon" || slugLower === "lake-austin-pontoon") return !boatType || boatType === "pontoon" || boatType === "tritoon";
  return true;
}

export interface BoatOption {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  photos: string[];
  fromPriceCents: number | null;
  rates: { id: string; durationHours: number; displayName: string; priceCents: number }[];
}

export async function GET(request: NextRequest) {
  const experienceId = request.nextUrl.searchParams.get("experienceId");
  if (!experienceId) {
    return NextResponse.json({ error: "experienceId required" }, { status: 400 });
  }

  try {
    const db = getDb();
    const expDoc = await db.collection("experiences").doc(experienceId).get();
    if (!expDoc.exists) {
      return NextResponse.json({ error: "Experience not found" }, { status: 404 });
    }
    const expData = expDoc.data() as { slug?: string };
    const experienceSlug = (expData?.slug ?? "").toLowerCase().trim();

    const expRatesSnap = await db.collection("experiences").doc(experienceId).collection("rates").where("active", "==", true).get();
    const experienceRates = expRatesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as { id: string } & ExperienceRate));
    const ratesForBoats = experienceRates
      .filter((r) => typeof r.priceCents === "number")
      .map((r) => ({ id: r.id, durationHours: r.durationHours, displayName: r.displayName, priceCents: r.priceCents }));

    let fromPriceCents: number | null = null;
    ratesForBoats.forEach((r) => {
      if (fromPriceCents == null || r.priceCents < fromPriceCents) fromPriceCents = r.priceCents;
    });

    const isPontoonSlug = experienceSlug === "pontoon" || experienceSlug === "lake-austin-pontoon";
    const snapById = await db
      .collection("boats")
      .where("isListingBoat", "==", true)
      .where("active", "==", true)
      .where("experienceIds", "array-contains", experienceId)
      .get();

    const [snapByPontoon, snapByLakeAustin] = isPontoonSlug
      ? await Promise.all([
          db.collection("boats").where("isListingBoat", "==", true).where("active", "==", true).where("experienceIds", "array-contains", "pontoon").get(),
          db.collection("boats").where("isListingBoat", "==", true).where("active", "==", true).where("experienceIds", "array-contains", "lake-austin-pontoon").get(),
        ])
      : [null, null];

    const docById = new Map(snapById.docs.map((d) => [d.id, d]));
    if (isPontoonSlug && snapByPontoon && snapByLakeAustin) {
      snapByPontoon.docs.forEach((d) => {
        if (!docById.has(d.id)) docById.set(d.id, d);
      });
      snapByLakeAustin.docs.forEach((d) => {
        if (!docById.has(d.id)) docById.set(d.id, d);
      });
    }

    const boats: BoatOption[] = Array.from(docById.values())
      .filter((doc) => allowBoatTypeForSlug(experienceSlug, (doc.data() as ListingBoat).boatType))
      .map((doc) => {
        const boat = doc.data() as ListingBoat;
        return {
          id: doc.id,
          name: boat.name,
          slug: boat.slug,
          description: boat.description,
          photos: boat.photos ?? [],
          fromPriceCents,
          rates: ratesForBoats,
        };
      });
    return NextResponse.json({ boats });
  } catch (err) {
    console.error("[booking/boats]", err);
    return NextResponse.json(
      { error: "Failed to load boats", detail: process.env.NODE_ENV === "development" ? (err instanceof Error ? err.message : String(err)) : undefined },
      { status: 500 }
    );
  }
}
