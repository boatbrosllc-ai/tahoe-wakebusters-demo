/**
 * Returns the listing price (cents) per date for the next N days for an experience.
 * Optional rateId: when set, uses that rate so step 3 calendar prices match checkout.
 * Uses holiday/weekend/Fri-Sun pricing so step 3 shows true prices for each date.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";

export const dynamic = "force-dynamic";
/** Allow longer timeout so second-month requests succeed in production (Netlify default 10s). */
export const maxDuration = 26;

import { getEffectiveRatePriceCents, isDateInAnyHolidayRange, isDefaultUSHoliday } from "@/lib/booking/pricing";
import { getExperienceBySlug } from "@/content/experiences";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { getExperienceIdVariants, inferSlugFromTitle } from "@/lib/booking/experience-aliases";
import type { Experience, ExperienceRate } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";

/** YYYY-MM-DD from date parts. Use UTC so keys are deterministic across server timezones. */
function toISODateUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
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

    const exp = expSnap.data() as Experience & { name?: string };
    const experienceSlug = (typeof exp?.slug === "string" ? exp.slug.trim() : "").toLowerCase();
    const inferredSlugFromTitle = inferSlugFromTitle(exp?.title ?? exp?.name);
    const effectiveSlug = experienceSlug || inferredSlugFromTitle;
    // Match experience-detail and slots: sunset/holiday are ticketed unless explicitly charter
    const isTicketedInferred = (effectiveSlug === "sunset" || effectiveSlug === "holiday") && exp.pricingType !== "charter";
    const isTicketed = exp.pricingType === "ticketed" || isTicketedInferred;
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
    const contentExp = getExperienceBySlug(effectiveSlug || (exp.slug ?? ""));
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
      start = new Date(startDateParam + "T12:00:00.000Z");
      if (isNaN(start.getTime())) start = new Date();
    } else {
      start = new Date();
    }
    const prices: Record<string, number> = {};
    const holidayDateStrings: string[] = [];
    const dateStrs: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = toISODateUTC(d);
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

      const startStr = dateStrs[0];
      const endStr = dateStrs[dateStrs.length - 1];

      const allExpIds = getExperienceIdVariants(experienceId, effectiveSlug);
      type QuerySnapshot = import("firebase-admin").firestore.QuerySnapshot;

      // Bookings: one query per experience ID variant, then merge (so sunset/holiday match regardless of stored experienceId)
      const bookingsSnaps = await Promise.all(
        allExpIds.map((expId) =>
          db.collection("bookings")
            .where("experienceId", "==", expId)
            .where("startDateStr", ">=", startStr)
            .where("startDateStr", "<=", endStr)
            .get()
        )
      );
      const holdsWindowedSnaps = await Promise.all(
        allExpIds.map((expId) =>
          db.collection("holds")
            .where("experienceId", "==", expId)
            .where("startDateStr", ">=", startStr)
            .where("startDateStr", "<=", endStr)
            .get()
        )
      );
      const legacyFallbackEnabled = process.env.DISABLE_LEGACY_HOLDS_FALLBACK !== "true";
      const holdsLegacySnaps = legacyFallbackEnabled
        ? await Promise.all(
            allExpIds.map((expId) =>
              db.collection("holds")
                .where("experienceId", "==", expId)
                .where("status", "==", "active")
                .limit(100)
                .get()
            )
          )
        : ([] as QuerySnapshot[]);

      const holdDocMap = new Map<string, import("firebase-admin").firestore.QueryDocumentSnapshot>();
      for (const snap of holdsWindowedSnaps) {
        for (const doc of snap.docs) holdDocMap.set(doc.id, doc);
      }
      for (const snap of holdsLegacySnaps) {
        for (const doc of snap.docs) {
          if (holdDocMap.has(doc.id)) continue;
          const legacyData = doc.data() as { startDateStr?: string };
          if (legacyData.startDateStr) continue;
          holdDocMap.set(doc.id, doc);
        }
      }

      const now = Date.now();
      const soldByDate: Record<string, number> = {};
      const heldByDate: Record<string, number> = {};
      for (const snap of bookingsSnaps) {
        for (const doc of snap.docs) {
          const b = doc.data() as { slotId?: string; partySize?: number; status?: string };
          if (!b.slotId || typeof b.partySize !== "number") continue;
          if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
          const parsed = parseSlotId(b.slotId);
          if (!parsed || !dateSet.has(parsed.dateStr)) continue;
          soldByDate[parsed.dateStr] = (soldByDate[parsed.dateStr] ?? 0) + b.partySize;
        }
      }
      for (const doc of Array.from(holdDocMap.values())) {
        const h = doc.data() as { slotId?: string; startDateStr?: string; partySize?: number; status?: string; expiresAt?: { toDate(): Date } };
        if (!h.slotId || typeof h.partySize !== "number") continue;
        if (h.status !== "active") continue;
        if (h.expiresAt && h.expiresAt.toDate().getTime() < now) continue;
        const holdDate = h.startDateStr ?? parseSlotId(h.slotId)?.dateStr;
        if (!holdDate || !dateSet.has(holdDate)) continue;
        heldByDate[holdDate] = (heldByDate[holdDate] ?? 0) + h.partySize;
      }

      ticketsAvailableByDate = {};
      for (const dateStr of dateStrs) {
        const sold = soldByDate[dateStr] ?? 0;
        const held = heldByDate[dateStr] ?? 0;
        ticketsAvailableByDate[dateStr] = Math.max(0, total - sold - held);
      }
    }

    const noStoreHeaders = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    };
    return NextResponse.json(
      { prices, holidayDateStrings, pricingType: isTicketed ? "ticketed" : (exp.pricingType ?? "charter"), ticketsAvailableByDate },
      { headers: noStoreHeaders }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load date prices";
    const startDateParam = request.nextUrl.searchParams.get("startDate");
    console.error("[date-prices] error", { experienceId: request.nextUrl.searchParams.get("experienceId"), startDateParam, message });
    console.error("[date-prices]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
