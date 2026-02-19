/**
 * Returns the listing price (cents) per date for the next N days for an experience.
 * Optional rateId: when set, uses that rate so step 3 calendar prices match checkout.
 * Uses holiday/weekend/Fri-Sun pricing so step 3 shows true prices for each date.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { getEffectiveRatePriceCents, isDateInAnyHolidayRange, isDefaultUSHoliday } from "@/lib/booking/pricing";
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
    const startDateParam = request.nextUrl.searchParams.get("startDate"); // YYYY-MM-DD, optional
    const rateIdParam = request.nextUrl.searchParams.get("rateId"); // optional; when set, use that rate so step 3 matches checkout

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
    // Default to first rate by duration (smallest) so calendar prices are deterministic when no rateId is passed.
    const sortedRates = [...rates].sort((a, b) => (a.durationHours ?? 0) - (b.durationHours ?? 0));
    const chosenRate = rateIdParam
      ? rates.find((r) => r.id === rateIdParam) ?? sortedRates[0]
      : sortedRates[0];
    const rateForPricing = {
      priceCents: chosenRate.priceCents,
      priceWeekendCents: chosenRate.priceWeekendCents,
      priceFriSunCents: chosenRate.priceFriSunCents,
      priceHolidayCents: chosenRate.priceHolidayCents,
      durationHours: chosenRate.durationHours,
    };

    let start: Date;
    if (startDateParam && /^\d{4}-\d{2}-\d{2}$/.test(startDateParam)) {
      start = new Date(startDateParam + "T00:00:00");
      if (isNaN(start.getTime())) start = new Date();
    } else {
      start = new Date();
    }
    start.setHours(0, 0, 0, 0);
    const prices: Record<string, number> = {};
    const holidayDateStrings: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = toISODate(d);
      prices[dateStr] = getEffectiveRatePriceCents(rateForPricing, d, holidayDates, weekendDays, friSunDays);
      if (isDateInAnyHolidayRange(dateStr, holidayDates) || isDefaultUSHoliday(dateStr)) {
        holidayDateStrings.push(dateStr);
      }
    }

    return NextResponse.json({ prices, holidayDateStrings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load date prices";
    console.error("[date-prices]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
