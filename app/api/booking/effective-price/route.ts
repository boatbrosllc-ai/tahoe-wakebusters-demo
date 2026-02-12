/**
 * Returns the effective price (cents) for a given experience rate on a given date.
 * Used by the booking modal so step 4 summary matches checkout (weekend/holiday/Fri-Sun pricing).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { getEffectiveRatePriceCents } from "@/lib/booking/pricing";
import type { Experience, ExperienceRate } from "@/lib/booking/types";

export async function GET(request: NextRequest) {
  try {
    const experienceId = request.nextUrl.searchParams.get("experienceId");
    const rateId = request.nextUrl.searchParams.get("rateId");
    const dateStr = request.nextUrl.searchParams.get("date"); // YYYY-MM-DD
    if (!experienceId || !rateId || !dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: "experienceId, rateId, and date (YYYY-MM-DD) required" }, { status: 400 });
    }

    const db = getDb();
    const [expSnap, rateSnap] = await Promise.all([
      db.collection("experiences").doc(experienceId).get(),
      db.collection("experiences").doc(experienceId).collection("rates").doc(rateId).get(),
    ]);

    if (!expSnap.exists) {
      return NextResponse.json({ error: "Experience not found" }, { status: 404 });
    }
    if (!rateSnap.exists) {
      return NextResponse.json({ error: "Rate not found" }, { status: 404 });
    }

    const exp = expSnap.data() as Experience;
    const rate = rateSnap.data() as ExperienceRate & { id: string };
    if (!rate.active) {
      return NextResponse.json({ error: "Rate not available" }, { status: 400 });
    }

    const date = new Date(dateStr + "T12:00:00");
    if (isNaN(date.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const priceCents = getEffectiveRatePriceCents(
      {
        priceCents: rate.priceCents,
        priceWeekendCents: rate.priceWeekendCents,
        priceFriSunCents: rate.priceFriSunCents,
        priceHolidayCents: rate.priceHolidayCents,
        durationHours: rate.durationHours,
      },
      date,
      exp.holidayDates,
      exp.weekendDays,
      exp.friSunDays
    );

    return NextResponse.json({ priceCents });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get effective price";
    console.error("[effective-price]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
