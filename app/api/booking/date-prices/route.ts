/**
 * Returns the listing price (cents) per date for the next N days for an experience.
 * Uses the experience's first rate and holiday/weekend pricing so step 3 can show dynamic prices.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { getEffectiveRatePriceCents } from "@/lib/booking/pricing";
import type { Experience, ExperienceRate } from "@/lib/booking/types";

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(request: NextRequest) {
  try {
    const experienceId = request.nextUrl.searchParams.get("experienceId");
    if (!experienceId) {
      return NextResponse.json({ error: "experienceId required" }, { status: 400 });
    }
    const daysParam = request.nextUrl.searchParams.get("days");
    const days = Math.min(Math.max(parseInt(daysParam ?? "35", 10) || 35, 1), 90);

    const db = getDb();
    const [expSnap, ratesSnap] = await Promise.all([
      db.collection("experiences").doc(experienceId).get(),
      db.collection("experiences").doc(experienceId).collection("rates").where("active", "==", true).get(),
    ]);

    if (!expSnap.exists) {
      return NextResponse.json({ error: "Experience not found" }, { status: 404 });
    }
    if (ratesSnap.empty) {
      return NextResponse.json({ prices: {} });
    }

    const exp = expSnap.data() as Experience;
    const holidayDates = exp.holidayDates;
    const weekendDays = exp.weekendDays;
    const friSunDays = exp.friSunDays;

    const rates = ratesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ExperienceRate & { id: string }));
    const firstRate = rates[0];
    const rateForPricing = {
      priceCents: firstRate.priceCents,
      priceWeekendCents: firstRate.priceWeekendCents,
      priceFriSunCents: firstRate.priceFriSunCents,
      priceHolidayCents: firstRate.priceHolidayCents,
      durationHours: firstRate.durationHours,
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const prices: Record<string, number> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = toISODate(d);
      prices[dateStr] = getEffectiveRatePriceCents(rateForPricing, d, holidayDates, weekendDays, friSunDays);
    }

    return NextResponse.json({ prices });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load date prices";
    console.error("[date-prices]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
