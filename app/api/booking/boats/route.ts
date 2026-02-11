/**
 * GET /api/booking/boats?experienceId=... — list boats assigned to an experience (for booking flow).
 * Returns listing boats with their rates (fromPriceCents) for the picker.
 */
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import type { ListingBoat, BoatRate } from "@/lib/booking/types";

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
    const snap = await db
      .collection("boats")
      .where("isListingBoat", "==", true)
      .where("active", "==", true)
      .where("experienceIds", "array-contains", experienceId)
      .get();

    const boats: BoatOption[] = [];
    for (const doc of snap.docs) {
      const boat = doc.data() as ListingBoat;
      const ratesSnap = await db.collection("boats").doc(doc.id).collection("rates").where("active", "==", true).get();
      const rates = ratesSnap.docs.map((r) => {
        const d = r.data() as BoatRate;
        return { id: r.id, durationHours: d.durationHours, displayName: d.displayName, priceCents: d.priceCents };
      });
      let fromPriceCents: number | null = null;
      rates.forEach((r) => {
        if (fromPriceCents == null || r.priceCents < fromPriceCents) fromPriceCents = r.priceCents;
      });
      boats.push({
        id: doc.id,
        name: boat.name,
        slug: boat.slug,
        description: boat.description,
        photos: boat.photos ?? [],
        fromPriceCents,
        rates,
      });
    }
    return NextResponse.json({ boats });
  } catch (err) {
    console.error("[booking/boats]", err);
    return NextResponse.json(
      { error: "Failed to load boats", detail: process.env.NODE_ENV === "development" ? (err instanceof Error ? err.message : String(err)) : undefined },
      { status: 500 }
    );
  }
}
