/**
 * Returns the listing price (cents) per date for the next N days for an experience.
 * Optional rateId: when set, uses that rate so step 3 calendar prices match checkout.
 * Uses holiday/weekend/Fri-Sun pricing so step 3 shows true prices for each date.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { getEffectiveRatePriceCents, isDateInAnyHolidayRange, isDefaultUSHoliday } from "@/lib/booking/pricing";
import { getExperienceBySlug } from "@/content/experiences";
import { parseSlotId } from "@/lib/booking/experience-slots";
import type { Experience, ExperienceRate } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";

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
    const isTicketed = exp.pricingType === "ticketed";
    const holidayDates = exp.holidayDates;
    const weekendDays = exp.weekendDays;
    const friSunDays = exp.friSunDays;

    const rates = ratesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ExperienceRate & { id: string }));
    // Default to first rate by duration (smallest) so calendar prices are deterministic when no rateId is passed.
    const sortedRates = [...rates].sort((a, b) => (a.durationHours ?? 0) - (b.durationHours ?? 0));
    const chosenRate = rateIdParam
      ? rates.find((r) => r.id === rateIdParam) ?? sortedRates[0]
      : sortedRates[0];
    // For ticketed experiences, the listing page overrides the display price with the static
    // content fromPriceCents (e.g. $35/ticket from content/experiences.ts). Use the same
    // override here so the calendar shows the same per-ticket price as the listing page.
    const contentExp = getExperienceBySlug(exp.slug ?? "");
    const ticketedDisplayPriceCents =
      isTicketed && contentExp?.fromPriceCents != null
        ? contentExp.fromPriceCents
        : chosenRate.priceCents;

    const rateForPricing = {
      priceCents: ticketedDisplayPriceCents,
      // Ticketed: weekend/holiday overrides are disabled in admin — always use base price
      priceWeekendCents: isTicketed ? undefined : chosenRate.priceWeekendCents,
      priceFriSunCents: isTicketed ? undefined : chosenRate.priceFriSunCents,
      priceHolidayCents: isTicketed ? undefined : chosenRate.priceHolidayCents,
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
    const dateStrs: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const dateStr = toISODate(d);
      dateStrs.push(dateStr);
      prices[dateStr] = getEffectiveRatePriceCents(rateForPricing, d, holidayDates, weekendDays, friSunDays);
      // Only mark holiday highlights for charter experiences
      if (!isTicketed && (isDateInAnyHolidayRange(dateStr, holidayDates) || isDefaultUSHoliday(dateStr))) {
        holidayDateStrings.push(dateStr);
      }
    }

    // For ticketed experiences: batch-query ticket counts so the calendar can show sold-out dates
    let ticketsAvailableByDate: Record<string, number> | undefined;
    if (isTicketed) {
      const total = exp.maxCapacity ?? exp.maxGuests ?? 36;
      const dateSet = new Set(dateStrs);

      // Query by experienceId only — filter status/expiry in memory to avoid composite index requirement
      const [bookingsSnap, holdsSnap] = await Promise.all([
        db.collection("bookings").where("experienceId", "==", experienceId).get(),
        db.collection("holds").where("experienceId", "==", experienceId).where("status", "==", "active").get(),
      ]);

      // Aggregate sold + onHold per date (filter status and expiry in memory)
      const now = Date.now();
      const soldByDate: Record<string, number> = {};
      const heldByDate: Record<string, number> = {};
      for (const doc of bookingsSnap.docs) {
        const b = doc.data() as { slotId?: string; partySize?: number; status?: string };
        if (!b.slotId || typeof b.partySize !== "number") continue;
        if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
        const parsed = parseSlotId(b.slotId);
        if (!parsed || !dateSet.has(parsed.dateStr)) continue;
        soldByDate[parsed.dateStr] = (soldByDate[parsed.dateStr] ?? 0) + b.partySize;
      }
      for (const doc of holdsSnap.docs) {
        const h = doc.data() as { slotId?: string; partySize?: number; expiresAt?: { toDate(): Date } };
        if (!h.slotId || typeof h.partySize !== "number") continue;
        if (h.expiresAt && h.expiresAt.toDate().getTime() < now) continue; // expired
        const parsed = parseSlotId(h.slotId);
        if (!parsed || !dateSet.has(parsed.dateStr)) continue;
        heldByDate[parsed.dateStr] = (heldByDate[parsed.dateStr] ?? 0) + h.partySize;
      }

      ticketsAvailableByDate = {};
      for (const dateStr of dateStrs) {
        const sold = soldByDate[dateStr] ?? 0;
        const held = heldByDate[dateStr] ?? 0;
        ticketsAvailableByDate[dateStr] = Math.max(0, total - sold - held);
      }
    }

    return NextResponse.json({ prices, holidayDateStrings, pricingType: exp.pricingType ?? "charter", ticketsAvailableByDate });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load date prices";
    console.error("[date-prices]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
