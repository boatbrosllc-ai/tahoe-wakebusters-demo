/**
 * Returns the listing price (cents) per date for the next N days for an experience.
 *
 * **rateId:** When set, uses that rate’s duration/pricing so the calendar matches checkout for the selected tier.
 * When `rateId` is omitted, the API uses the **shortest active rate by duration** (deterministic default — may not
 * match a customer’s eventual rate until they pick one). Prefer always passing `rateId` from the booking UI.
 *
 * Uses holiday/weekend/Fri-Sun pricing so step 3 shows true prices for each date.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { checkRateLimitPublicRead, getClientKey } from "@/lib/booking/rate-limit";

export const dynamic = "force-dynamic";
/** Allow longer timeout so second-month requests succeed in production (Netlify default 10s). */
export const maxDuration = 26;

import { getEffectiveBoatRatePriceCents, getEffectiveRatePriceCents, isDateInAnyHolidayRange, isDefaultUSHoliday } from "@/lib/booking/pricing";
import { getChicagoToday } from "@/lib/booking/booking-date-range";
import { fetchMergedPricingCalendarRatesForBoatTypes } from "@/lib/booking/pricing-calendar-fetch";
import type { BoatPriceOverride, ListingBoat } from "@/lib/booking/types";
import { getDateStrInSlotTimezone, isSeasonalAllowed, parseSlotIdRelaxed } from "@/lib/booking/experience-slots";
import { addCalendarDaysToDateStr, bookingLookbackDaysFromMaxDuration } from "@/lib/booking/booking-interval";
import { getExperienceIdVariants, inferSlugFromTitle, isTicketedExperienceSlug } from "@/lib/booking/experience-aliases";
import type { Experience, ExperienceRate } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { warnIfLegacyHoldsFallbackEnabled } from "@/lib/booking/legacy-fallback-warn";
import {
  LEGACY_HOLDS_CONSERVATIVE_AVAILABILITY_NOTE,
  scanLegacyActiveHoldsForExperience,
} from "@/lib/booking/legacy-hold-scan";

/** Abort legacy hold pagination early so ticketed calendar can render if Firestore is slow (see `partialData`). Prefer `DISABLE_LEGACY_HOLDS_FALLBACK=true` after holds `startDateStr` backfill to remove this timeout risk. */
const LEGACY_HOLDS_FETCH_BUDGET_MS = 8_000;

/** YYYY-MM-DD in America/Chicago for consistent calendar and checkout pricing. */
function toDateStrCentral(d: Date): string {
  return getDateStrInSlotTimezone(d);
}

export async function GET(request: NextRequest) {
  try {
    const experienceId = request.nextUrl.searchParams.get("experienceId");
    if (!experienceId) {
      return NextResponse.json({ error: "experienceId required" }, { status: 400 });
    }
    const rl = await checkRateLimitPublicRead(getClientKey(request));
    if (!rl.allowed) {
      const retryAfter = rl.retryAfterMs ? Math.ceil(rl.retryAfterMs / 1000) : 60;
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
    const daysParam = request.nextUrl.searchParams.get("days");
    const days = Math.min(Math.max(parseInt(daysParam ?? "35", 10) || 35, 1), 90);
    const startDateParam = request.nextUrl.searchParams.get("startDate"); // YYYY-MM-DD, optional
    const rateIdRaw = request.nextUrl.searchParams.get("rateId"); // optional; when set, use that rate so step 3 matches checkout
    const rateIdParam = rateIdRaw != null && rateIdRaw.trim() !== "" ? rateIdRaw.trim() : null;
    const boatIdParam = request.nextUrl.searchParams.get("boatId")?.trim() || null;

    const db = getDb();
    const [expSnap, ratesSnap, listingBoatsSnap] = await Promise.all([
      db.collection("experiences").doc(experienceId).get(),
      db.collection("experiences").doc(experienceId).collection("rates").where("active", "==", true).get(),
      db
        .collection("boats")
        .where("isListingBoat", "==", true)
        .where("active", "==", true)
        .where("experienceIds", "array-contains", experienceId)
        .get(),
    ]);
    const boatTypesForCalendar = Array.from(
      new Set(
        listingBoatsSnap.docs
          .map((d) => (d.data() as ListingBoat).boatType)
          .filter((t): t is string => typeof t === "string" && t.trim() !== "")
          .map((t) => t.trim())
      )
    );
    const mergedCalendarRates =
      boatTypesForCalendar.length > 0
        ? await fetchMergedPricingCalendarRatesForBoatTypes(db, boatTypesForCalendar)
        : undefined;

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
    // Match experience-detail and slots: sunset/holiday family are ticketed unless explicitly charter
    const isTicketedInferred = isTicketedExperienceSlug(effectiveSlug) && exp.pricingType !== "charter";
    const isTicketed = exp.pricingType === "ticketed" || isTicketedInferred;
    const holidayDates = exp.holidayDates;
    const weekendDays = exp.weekendDays;
    const friSunDays = exp.friSunDays;

    const rates = ratesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ExperienceRate & { id: string }));
    // Default to first rate by duration (smallest) so calendar prices are deterministic when no rateId is passed.
    const sortedRates = [...rates].sort((a, b) => (a.durationHours ?? 0) - (b.durationHours ?? 0));
    const noStoreHeadersEarly: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    };
    let chosenRate: ExperienceRate & { id: string };
    if (rateIdParam) {
      const found = rates.find((r) => r.id === rateIdParam);
      if (!found) {
        return NextResponse.json(
          {
            error: "The selected rate is no longer available. Please refresh and choose a trip length again.",
            rateIdMismatch: true as const,
          },
          { status: 400, headers: noStoreHeadersEarly }
        );
      }
      chosenRate = found;
    } else {
      chosenRate = sortedRates[0];
    }
    // Use full rate pricing (weekday + weekend + holiday + special dates) for both charter and ticketed.
    // Ticketed listing "From $X per ticket" can come from content override or min rate; calendar shows actual price per date.
    const rateForPricing = {
      priceCents: chosenRate.priceCents,
      priceWeekendCents: chosenRate.priceWeekendCents,
      priceFriSunCents: chosenRate.priceFriSunCents,
      priceHolidayCents: chosenRate.priceHolidayCents,
      durationHours: chosenRate.durationHours,
    };

    let start: Date;
    if (startDateParam && /^\d{4}-\d{2}-\d{2}$/.test(startDateParam)) {
      start = new Date(startDateParam + "T12:00:00.000Z");
      if (isNaN(start.getTime())) start = new Date();
    } else {
      const chicagoToday = getChicagoToday();
      start = new Date(chicagoToday + "T12:00:00.000Z");
      if (isNaN(start.getTime())) start = new Date();
    }
    const prices: Record<string, number> = {};
    const holidayDateStrings: string[] = [];
    const dateStrs: string[] = [];
    const useListingBoatCalendar = boatTypesForCalendar.length > 0;
    /** Per-boat date-range price overrides (charter listing boats). */
    let priceOverridesForCalendar: BoatPriceOverride[] | undefined;
    if (useListingBoatCalendar) {
      if (listingBoatsSnap.docs.length === 1) {
        const lb = listingBoatsSnap.docs[0].data() as ListingBoat;
        priceOverridesForCalendar = Array.isArray(lb.priceOverrides) ? lb.priceOverrides : undefined;
      } else if (boatIdParam) {
        const fromSnap = listingBoatsSnap.docs.find((d) => d.id === boatIdParam);
        if (fromSnap) {
          const lb = fromSnap.data() as ListingBoat;
          priceOverridesForCalendar = Array.isArray(lb.priceOverrides) ? lb.priceOverrides : undefined;
        } else {
          const boatSnap = await db.collection("boats").doc(boatIdParam).get();
          if (boatSnap.exists) {
            const lb = boatSnap.data() as ListingBoat;
            priceOverridesForCalendar = Array.isArray(lb.priceOverrides) ? lb.priceOverrides : undefined;
          }
        }
      }
      // Multi-boat listing experience with no boatId: calendar uses merged type-level rates only; per-boat
      // priceOverrides are applied after the customer selects a boat (see create-hold / effective-price).
    }
    /** When a specific boat is selected, use that boat's boatType calendar only — not merged across all listing boats. */
    let calendarRatesForDayLoop: Record<string, number> | undefined = mergedCalendarRates;
    if (useListingBoatCalendar && boatIdParam) {
      let lb: ListingBoat | null = null;
      const fromSnap = listingBoatsSnap.docs.find((d) => d.id === boatIdParam);
      if (fromSnap) lb = fromSnap.data() as ListingBoat;
      else {
        const boatSnap = await db.collection("boats").doc(boatIdParam).get();
        if (boatSnap.exists) lb = boatSnap.data() as ListingBoat;
      }
      const bt = typeof lb?.boatType === "string" ? lb.boatType.trim() : "";
      if (bt) {
        calendarRatesForDayLoop = await fetchMergedPricingCalendarRatesForBoatTypes(db, [bt]);
      }
    }
    const seasonalForPricing = exp.seasonal;
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = toDateStrCentral(d);
      dateStrs.push(dateStr);
      if (isTicketed && seasonalForPricing?.enabled && !isSeasonalAllowed(seasonalForPricing, d, dateStr)) {
        prices[dateStr] = 0;
        continue;
      }
      prices[dateStr] = useListingBoatCalendar
        ? getEffectiveBoatRatePriceCents(
            {
              priceCents: rateForPricing.priceCents,
              priceWeekendCents: rateForPricing.priceWeekendCents,
              priceFriSunCents: rateForPricing.priceFriSunCents,
              priceHolidayCents: rateForPricing.priceHolidayCents,
              durationHours: chosenRate.durationHours ?? 0,
            },
            d,
            holidayDates,
            priceOverridesForCalendar,
            calendarRatesForDayLoop,
            weekendDays,
            friSunDays
          )
        : getEffectiveRatePriceCents(rateForPricing, d, holidayDates, weekendDays, friSunDays);
      // Mark holiday highlights for calendar (charter and ticketed)
      if (isDateInAnyHolidayRange(dateStr, holidayDates) || isDefaultUSHoliday(dateStr)) {
        holidayDateStrings.push(dateStr);
      }
    }

    // For ticketed experiences: batch-query ticket counts so the calendar can show sold-out dates
    let ticketsAvailableByDate: Record<string, number> | undefined;
    let legacyTimedOut = false;
    if (isTicketed) {
      const total = exp.maxCapacity ?? exp.maxGuests ?? 36;
      const dateSet = new Set(dateStrs);

      const startStr = dateStrs[0];
      const endStr = dateStrs[dateStrs.length - 1];
      const ticketedBookingRangeStart = addCalendarDaysToDateStr(
        startStr,
        -bookingLookbackDaysFromMaxDuration(chosenRate.durationHours ?? 12),
      );

      const allExpIds = getExperienceIdVariants(experienceId, effectiveSlug);
      // Bookings: one query per experience ID variant, then merge (so sunset/holiday match regardless of stored experienceId)
      const bookingsSnaps = await Promise.all(
        allExpIds.map((expId) =>
          db.collection("bookings")
            .where("experienceId", "==", expId)
            .where("startDateStr", ">=", ticketedBookingRangeStart)
            .where("startDateStr", "<=", endStr)
            .get()
        )
      );
      const holdsWindowedSnaps = await Promise.all(
        allExpIds.map((expId) =>
          db.collection("holds")
            .where("experienceId", "==", expId)
            .where("startDateStr", ">=", ticketedBookingRangeStart)
            .where("startDateStr", "<=", endStr)
            .get()
        )
      );
      // Cursor-based pagination for legacy holds (no startDateStr) to avoid undercounting. Long-term: backfill
      // startDateStr on holds and set DISABLE_LEGACY_HOLDS_FALLBACK=true.
      const legacyFallbackEnabled = process.env.DISABLE_LEGACY_HOLDS_FALLBACK !== "true";
      if (legacyFallbackEnabled) warnIfLegacyHoldsFallbackEnabled();
      const holdsLegacyDocLists = legacyFallbackEnabled
        ? await Promise.all(
            allExpIds.map(async (expId) => {
              const r = await scanLegacyActiveHoldsForExperience(db, expId, {
                budgetMs: LEGACY_HOLDS_FETCH_BUDGET_MS,
                emptyDocsOnTimeout: true,
              });
              if (r.timedOut) legacyTimedOut = true;
              return r.docs;
            })
          )
        : ([] as import("firebase-admin").firestore.QueryDocumentSnapshot[][]);

      const holdDocMap = new Map<string, import("firebase-admin").firestore.QueryDocumentSnapshot>();
      for (const snap of holdsWindowedSnaps) {
        for (const doc of snap.docs) holdDocMap.set(doc.id, doc);
      }
      for (const legacyDocs of holdsLegacyDocLists) {
        for (const doc of legacyDocs) {
          if (holdDocMap.has(doc.id)) continue;
          const legacyData = doc.data() as { startDateStr?: string };
          if (legacyData.startDateStr) continue;
          holdDocMap.set(doc.id, doc);
        }
      }

      const now = Date.now();
      const soldByDate: Record<string, number> = {};
      const heldByDate: Record<string, number> = {};
      const charterLockedDates = new Set<string>();
      for (const snap of bookingsSnaps) {
        for (const doc of snap.docs) {
          const b = doc.data() as {
            slotId?: string;
            slot_id?: string;
            partySize?: number;
            status?: string;
            bookingMode?: string;
          };
          const slotRaw = b.slotId ?? b.slot_id;
          if (!slotRaw || typeof b.partySize !== "number") continue;
          if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
          const parsed = parseSlotIdRelaxed(slotRaw);
          if (!parsed || !dateSet.has(parsed.dateStr)) continue;
          // Charter bookings lock the full ticketed departure for that date when they match the experience's departure time.
          if (b.bookingMode === "charter") {
            const expDepHour = (exp as { departureHour?: number }).departureHour;
            const expDepMinute = (exp as { departureMinute?: number }).departureMinute;
            const expHasDeparture =
              typeof expDepHour === "number" &&
              Number.isFinite(expDepHour) &&
              typeof expDepMinute === "number" &&
              Number.isFinite(expDepMinute);
            const matchesDeparture = expHasDeparture
              ? parsed.startHour === expDepHour && (parsed.startMinute ?? 0) === expDepMinute
              : true;
            if (matchesDeparture) {
              charterLockedDates.add(parsed.dateStr);
              continue;
            }
          }
          soldByDate[parsed.dateStr] = (soldByDate[parsed.dateStr] ?? 0) + b.partySize;
        }
      }
      for (const doc of Array.from(holdDocMap.values())) {
        const h = doc.data() as {
          slotId?: string;
          slot_id?: string;
          startDateStr?: string;
          partySize?: number;
          status?: string;
          expiresAt?: { toDate(): Date };
        };
        const slotRawH = h.slotId ?? h.slot_id;
        if (!slotRawH || typeof h.partySize !== "number") continue;
        if (h.status !== "active") continue;
        if (h.expiresAt && h.expiresAt.toDate().getTime() < now) continue;
        const holdDate = h.startDateStr ?? parseSlotIdRelaxed(slotRawH)?.dateStr;
        if (!holdDate || !dateSet.has(holdDate)) continue;
        heldByDate[holdDate] = (heldByDate[holdDate] ?? 0) + h.partySize;
      }

      ticketsAvailableByDate = {};
      for (const dateStr of dateStrs) {
        if (seasonalForPricing?.enabled && !isSeasonalAllowed(seasonalForPricing, new Date(dateStr + "T12:00:00.000Z"), dateStr)) {
          ticketsAvailableByDate[dateStr] = 0;
          continue;
        }
        const sold = soldByDate[dateStr] ?? 0;
        const held = heldByDate[dateStr] ?? 0;
        ticketsAvailableByDate[dateStr] = charterLockedDates.has(dateStr) ? 0 : Math.max(0, total - sold - held);
      }
    }

    const noStoreHeaders = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    };
    return NextResponse.json(
      {
        prices,
        holidayDateStrings,
        pricingType: isTicketed ? "ticketed" : (exp.pricingType ?? "charter"),
        ticketsAvailableByDate,
        ...(legacyTimedOut
          ? {
              partialData: true,
              conservativeEstimate: true as const,
              availabilityNote: LEGACY_HOLDS_CONSERVATIVE_AVAILABILITY_NOTE,
            }
          : {}),
      },
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
