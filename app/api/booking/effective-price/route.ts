/**
 * Returns the effective price (cents) for a given experience rate on a given date.
 * Used by the booking modal so step 4 summary matches checkout (weekend/holiday/Fri-Sun pricing).
 * Slug resolution must stay in parity with date-prices/route.ts so calendar and checkout prices match.
 * Optional `boatId`: when set, uses that listing boat's boatType calendar + priceOverrides.
 */

import { NextRequest, NextResponse } from "next/server";
import type { DocumentSnapshot, QuerySnapshot } from "firebase-admin/firestore";
import { getDb } from "@/lib/booking/firebase-admin";
import { checkRateLimitPublicRead, getClientKey } from "@/lib/booking/rate-limit";
import { getEffectiveBoatRatePriceCents, getEffectiveRatePriceCents } from "@/lib/booking/pricing";
import { fetchMergedPricingCalendarRatesForBoatTypes } from "@/lib/booking/pricing-calendar-fetch";
import type { Experience, ExperienceRate, ListingBoat } from "@/lib/booking/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const experienceId = request.nextUrl.searchParams.get("experienceId");
    const rateId = request.nextUrl.searchParams.get("rateId");
    const dateStr = request.nextUrl.searchParams.get("date"); // YYYY-MM-DD
    const boatIdParam = request.nextUrl.searchParams.get("boatId");
    if (!experienceId || !rateId || !dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: "experienceId, rateId, and date (YYYY-MM-DD) required" }, { status: 400 });
    }

    const rl = await checkRateLimitPublicRead(getClientKey(request));
    if (!rl.allowed) {
      const retryAfter = rl.retryAfterMs ? Math.ceil(rl.retryAfterMs / 1000) : 60;
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const db = getDb();
    const boatIdTrim = boatIdParam?.trim() ?? "";
    const [expSnap, rateSnap, boatOrListingSnap] = await Promise.all([
      db.collection("experiences").doc(experienceId).get(),
      db.collection("experiences").doc(experienceId).collection("rates").doc(rateId).get(),
      boatIdTrim
        ? db.collection("boats").doc(boatIdTrim).get()
        : db
            .collection("boats")
            .where("isListingBoat", "==", true)
            .where("active", "==", true)
            .where("experienceIds", "array-contains", experienceId)
            .get(),
    ]);

    if (!expSnap.exists) {
      return NextResponse.json({ error: "Experience not found" }, { status: 404 });
    }
    if (!rateSnap.exists) {
      return NextResponse.json({ error: "Rate not found" }, { status: 404 });
    }
    if (boatIdTrim) {
      const bs = boatOrListingSnap as DocumentSnapshot;
      if (!bs.exists) {
        return NextResponse.json({ error: "Boat not found" }, { status: 404 });
      }
    }

    const exp = expSnap.data() as Experience & { name?: string };
    const rate = rateSnap.data() as ExperienceRate & { id: string };
    if (!rate.active) {
      return NextResponse.json({ error: "Rate not available" }, { status: 400 });
    }

    const date = new Date(dateStr + "T12:00:00.000Z");
    if (isNaN(date.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    let mergedCalendarRates: Record<string, number> | undefined;
    let listingBoat: ListingBoat | null = null;
    let useBoatPricing = false;

    if (boatIdTrim) {
      listingBoat = (boatOrListingSnap as DocumentSnapshot).data() as ListingBoat;
      const bt = typeof listingBoat.boatType === "string" ? listingBoat.boatType.trim() : "";
      useBoatPricing = true;
      if (bt) {
        mergedCalendarRates = await fetchMergedPricingCalendarRatesForBoatTypes(db, [bt]);
      }
    } else {
      const listingBoatsSnap = boatOrListingSnap as QuerySnapshot;
      const boatTypes = Array.from(
        new Set(
          listingBoatsSnap.docs
            .map((d) => (d.data() as ListingBoat).boatType)
            .filter((t): t is string => typeof t === "string" && t.trim() !== "")
            .map((t) => t.trim())
        )
      );
      useBoatPricing = boatTypes.length > 0;
      if (boatTypes.length > 0) {
        mergedCalendarRates = await fetchMergedPricingCalendarRatesForBoatTypes(db, boatTypes);
      }
    }

    const rateShape = {
      priceCents: rate.priceCents,
      priceWeekendCents: rate.priceWeekendCents,
      priceFriSunCents: rate.priceFriSunCents,
      priceHolidayCents: rate.priceHolidayCents,
      durationHours: rate.durationHours,
    };
    const weekendDays = exp.weekendDays ?? [0, 6];
    const priceCents = useBoatPricing
      ? getEffectiveBoatRatePriceCents(
          rateShape,
          date,
          exp.holidayDates,
          listingBoat?.priceOverrides,
          mergedCalendarRates,
          weekendDays,
          exp.friSunDays
        )
      : getEffectiveRatePriceCents(rateShape, date, exp.holidayDates, weekendDays, exp.friSunDays);

    return NextResponse.json({ priceCents });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get effective price";
    console.error("[effective-price]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
