/**
 * Server-only: recompute pre-tip booking total (rate + addons + tax + fees) for validate-discount
 * when slotId + rateId + experienceId are provided, matching create-hold / effective-price date logic.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { DocumentSnapshot, QuerySnapshot } from "firebase-admin/firestore";
import { parseSlotIdRelaxed, parseSlotId } from "./experience-slots";
import { buildAddonSelectionsForPricing, computePricing, getEffectiveBoatRatePriceCents, getEffectiveRatePriceCents } from "./pricing";
import { fetchMergedPricingCalendarRatesForBoatTypes } from "./pricing-calendar-fetch";
import type { Experience, ExperienceAddon, ExperienceRate, ListingBoat } from "./types";

export type ValidateDiscountAddonInput = { addonId: string; qty: number };

/**
 * Returns the same `totalCents` as `computePricing` in create-hold when inputs are consistent, or null if
 * required data is missing or invalid (validate-discount returns 422 — no client-total fallback).
 */
export async function computeValidateDiscountTotalCents(
  db: Firestore,
  params: {
    slotId: string;
    rateId: string;
    experienceId: string;
    boatId?: string | null;
    partySize: number;
    bookingMode?: "shared" | "charter";
    addonSelections: ValidateDiscountAddonInput[];
  }
): Promise<number | null> {
  const { slotId, rateId, experienceId, partySize } = params;
  const bookingMode = params.bookingMode ?? "shared";
  const addonSelections = Array.isArray(params.addonSelections) ? params.addonSelections : [];

  const parsedForDate = parseSlotIdRelaxed(slotId) ?? parseSlotId(slotId);
  if (!parsedForDate) return null;

  const boatIdTrim = typeof params.boatId === "string" ? params.boatId.trim() : "";
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

  if (!expSnap.exists || !rateSnap.exists) return null;
  const exp = expSnap.data() as Experience & { name?: string };
  const rate = rateSnap.data() as ExperienceRate & { id: string };
  if (!rate.active) return null;

  const dateStr = parsedForDate.dateStr;
  const date = new Date(dateStr + "T12:00:00.000Z");
  if (isNaN(date.getTime())) return null;

  let mergedCalendarRates: Record<string, number> | undefined;
  let listingBoat: ListingBoat | null = null;
  let useBoatPricing = false;

  if (boatIdTrim) {
    const bs = boatOrListingSnap as DocumentSnapshot;
    if (!bs.exists) return null;
    listingBoat = bs.data() as ListingBoat;
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

  const rateForPricing = { ...rate, priceCents } as ExperienceRate & { priceCents: number };

  const addonsSnap = await db.collection("experiences").doc(experienceId).collection("addons").get();
  const addonsById = new Map<string, ExperienceAddon>();
  addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as ExperienceAddon));

  const addonsForPricing = buildAddonSelectionsForPricing(
    addonSelections.map((s) => ({ addonId: s.addonId, qty: s.qty })),
    addonsById
  );

  const isSharedTicketed = exp.pricingType === "ticketed" && bookingMode === "shared";
  const ticketQty = isSharedTicketed ? Math.max(1, Math.floor(Number(partySize))) : 1;

  const pricing = computePricing({
    rate: rateForPricing,
    addons: addonsForPricing,
    currency: "usd",
    qty: ticketQty,
  });

  return pricing.totalCents;
}
