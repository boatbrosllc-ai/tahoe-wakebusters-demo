/**
 * Returns the effective price (cents) for a given experience rate on a given date.
 * Used by the booking modal so step 4 summary matches checkout (weekend/holiday/Fri-Sun pricing).
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { getEffectiveRatePriceCents } from "@/lib/booking/pricing";
import { getExperienceBySlug } from "@/content/experiences";
import type { Experience, ExperienceRate } from "@/lib/booking/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "app/api/booking/effective-price/route.ts:GET",
      message: "effective-price handler entered",
      data: { url: request.nextUrl.pathname + request.nextUrl.search },
      timestamp: Date.now(),
      hypothesisId: "A",
    }),
  }).catch(() => {});
  // #endregion
  try {
    const experienceId = request.nextUrl.searchParams.get("experienceId");
    const rateId = request.nextUrl.searchParams.get("rateId");
    const dateStr = request.nextUrl.searchParams.get("date"); // YYYY-MM-DD
    if (!experienceId || !rateId || !dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: "app/api/booking/effective-price/route.ts:GET",
          message: "effective-price returning 400",
          data: { experienceId: !!experienceId, rateId: !!rateId, dateStr, dateValid: !!/^\d{4}-\d{2}-\d{2}$/.test(dateStr ?? "") },
          timestamp: Date.now(),
          hypothesisId: "B",
        }),
      }).catch(() => {});
      // #endregion
      return NextResponse.json({ error: "experienceId, rateId, and date (YYYY-MM-DD) required" }, { status: 400 });
    }

    const db = getDb();
    const [expSnap, rateSnap] = await Promise.all([
      db.collection("experiences").doc(experienceId).get(),
      db.collection("experiences").doc(experienceId).collection("rates").doc(rateId).get(),
    ]);

    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "app/api/booking/effective-price/route.ts:GET",
        message: "effective-price Firestore result",
        data: { expExists: expSnap.exists, rateExists: rateSnap.exists, experienceId, rateId },
        timestamp: Date.now(),
        hypothesisId: "C",
      }),
    }).catch(() => {});
    // #endregion

    if (!expSnap.exists) {
      return NextResponse.json({ error: "Experience not found" }, { status: 404 });
    }
    if (!rateSnap.exists) {
      return NextResponse.json({ error: "Rate not found" }, { status: 404 });
    }

    const exp = expSnap.data() as Experience;
    const isTicketed = exp.pricingType === "ticketed";
    const rate = rateSnap.data() as ExperienceRate & { id: string };
    if (!rate.active) {
      return NextResponse.json({ error: "Rate not available" }, { status: 400 });
    }

    const date = new Date(dateStr + "T12:00:00");
    if (isNaN(date.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    // Ticketed: use content fromPriceCents override when available so the checkout preview
    // matches the listing page and calendar (same override applied in date-prices API).
    if (isTicketed) {
      const contentExp = getExperienceBySlug(exp.slug ?? "");
      const priceCents = contentExp?.fromPriceCents ?? rate.priceCents;
      return NextResponse.json({ priceCents });
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

    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "app/api/booking/effective-price/route.ts:GET",
        message: "effective-price returning 200",
        data: { priceCents },
        timestamp: Date.now(),
        hypothesisId: "D",
      }),
    }).catch(() => {});
    // #endregion
    return NextResponse.json({ priceCents });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get effective price";
    // #region agent log
    fetch("http://127.0.0.1:7243/ingest/9217380b-37cf-4275-ae62-01f686adc624", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "app/api/booking/effective-price/route.ts:GET",
        message: "effective-price catch/500",
        data: { error: message },
        timestamp: Date.now(),
        hypothesisId: "E",
      }),
    }).catch(() => {});
    // #endregion
    console.error("[effective-price]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
