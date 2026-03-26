/**
 * Shared hold → booking pricing resolution for payment-intent and checkout routes.
 * Fast path: hold.pricing when valid; fallback follows create-payment-intent (rate/addon/calendar/ticket qty).
 */

import type { Firestore } from "firebase-admin/firestore";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import {
  buildAddonSelectionsForPricing,
  computePricing,
  getEffectiveBoatRatePriceCents,
  getEffectiveRatePriceCents,
} from "@/lib/booking/pricing";
import { fetchMergedPricingCalendarRatesForBoatTypes } from "@/lib/booking/pricing-calendar-fetch";
import type { Hold, Rate, Addon, Experience, ExperienceRate, ExperienceAddon, BoatRate, ListingBoat, BookingPricing } from "@/lib/booking/types";

export type HoldPricingMode = "payment_intent" | "checkout";

export type ResolvedHoldBookingPricing = {
  pricing: BookingPricing;
  rateForPricing: Rate | ExperienceRate | BoatRate;
  addonsForPricing: ReturnType<typeof buildAddonSelectionsForPricing>;
  /** Checkout: when true, use buildLineItemsFromHoldPricing / snapshot line items. */
  useSnapshotLineItems: boolean;
  /** Shared ticketed: ticket count for line items / pricing qty. */
  ticketQtyForLineItems: number | undefined;
};

function addonRowsMissingSnapshot(hold: Hold): boolean {
  const rows = hold.addonSelections ?? [];
  return rows.some((s) => Math.max(0, Math.floor(Number(s.qty))) > 0 && typeof s.priceCents !== "number");
}

/**
 * Resolve pricing for a hold: prefer hold.pricing when applicable; otherwise re-derive from Firestore (create-payment-intent reference).
 */
export async function resolveHoldBookingPricing(
  db: Firestore,
  hold: Hold,
  options?: { mode?: HoldPricingMode }
): Promise<ResolvedHoldBookingPricing> {
  const mode = options?.mode ?? "checkout";
  // Invariant: hold.pricing is the canonical snapshot created at hold creation and should be reused verbatim.
  // Transitional fallback remains only while legacy holds are backfilled.
  const hasExperience = !!hold.experienceId;
  const hasBoat = !!hold.boatId;
  const isListingBoatFlow = hasExperience && hasBoat;
  const isSharedTicketed = hold.pricingType === "ticketed" && (hold as { bookingMode?: string }).bookingMode === "shared";

  let rate: Rate | ExperienceRate | BoatRate;
  const addonsById = new Map<string, Addon | ExperienceAddon>();
  if (isListingBoatFlow) {
    const rateSnap = await db.collection("experiences").doc(hold.experienceId!).collection("rates").doc(hold.rateId).get();
    if (!rateSnap.exists) throw new Error("RATE_NOT_FOUND");
    rate = rateSnap.data() as ExperienceRate;
    const addonsSnap = await db.collection("experiences").doc(hold.experienceId!).collection("addons").get();
    addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as ExperienceAddon));
  } else if (hasExperience) {
    const rateSnap = await db.collection("experiences").doc(hold.experienceId!).collection("rates").doc(hold.rateId).get();
    if (!rateSnap.exists) throw new Error("RATE_NOT_FOUND");
    rate = rateSnap.data() as ExperienceRate;
    const addonsSnap = await db.collection("experiences").doc(hold.experienceId!).collection("addons").get();
    addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as ExperienceAddon));
  } else {
    const boatSnap = await db.collection("boats").doc(hold.boatId!).get();
    if (!boatSnap.exists) throw new Error("BOAT_NOT_FOUND");
    const rateSnap = await db.collection("boats").doc(hold.boatId!).collection("rates").doc(hold.rateId).get();
    if (!rateSnap.exists) throw new Error("RATE_NOT_FOUND");
    rate = rateSnap.data() as Rate;
    const addonsSnap = await db.collection("boats").doc(hold.boatId!).collection("addons").get();
    addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as Addon));
  }

  /** Snapshot line items only when every addon row has priceCents; otherwise `addonRowsMissingSnapshot` forces live `buildLineItems`. */
  const useSnapshotLineItemsCheckout =
    mode === "checkout" && !!hold.pricing && !addonRowsMissingSnapshot(hold);
  const useSnapshotPaymentIntent = mode === "payment_intent" && !!hold.pricing;

  if (useSnapshotPaymentIntent || useSnapshotLineItemsCheckout) {
    const pricing = hold.pricing as BookingPricing;
    let rateForPricing: Rate | ExperienceRate | BoatRate = rate;
    rateForPricing =
      hold.effectiveRateCents != null
        ? ({ ...rate, priceCents: hold.effectiveRateCents } as ExperienceRate & { priceCents: number })
        : rate;
    const ticketQtyForLineItems = isSharedTicketed ? Math.max(1, Math.floor(Number(hold.partySize ?? 1))) : undefined;
    return {
      pricing,
      rateForPricing,
      addonsForPricing: [],
      useSnapshotLineItems: true,
      ticketQtyForLineItems,
    };
  }

  if (mode === "payment_intent" && !hold.pricing) {
    throw new Error("HOLD_PRICING_REQUIRED_FOR_PAYMENT_INTENT");
  }

  if (mode === "checkout" && hold.pricing && hold.effectiveRateCents != null && !isSharedTicketed) {
    const rateForPricing = { ...rate, priceCents: hold.effectiveRateCents } as ExperienceRate & { priceCents: number };
    const pricing = hold.pricing as BookingPricing;
    const addonsForPricing = buildAddonSelectionsForPricing(hold.addonSelections, addonsById);
    return {
      pricing,
      rateForPricing,
      addonsForPricing,
      useSnapshotLineItems: false,
      ticketQtyForLineItems: undefined,
    };
  }

  const addonsForPricing = buildAddonSelectionsForPricing(hold.addonSelections, addonsById);
  let rateForPricing: Rate | ExperienceRate | BoatRate = rate;
  if (hasExperience && "priceCents" in rate) {
    const parsed = parseSlotId(hold.slotId);
    if (parsed) {
      const slotStart = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0).start;
      const expRef = db.collection("experiences").doc(hold.experienceId!);
      const [expDoc, boatDoc] = await Promise.all([
        expRef.get(),
        hasBoat ? db.collection("boats").doc(hold.boatId!).get() : Promise.resolve(null as import("firebase-admin/firestore").DocumentSnapshot | null),
      ]);
      const experience = expDoc.exists ? (expDoc.data() as Experience) : null;
      if (experience) {
        let calendarRates: Record<string, number> | undefined;
        if (boatDoc?.exists) {
          const lb = boatDoc.data() as ListingBoat;
          const bt = typeof lb.boatType === "string" ? lb.boatType.trim() : "";
          if (bt) {
            calendarRates = await fetchMergedPricingCalendarRatesForBoatTypes(db, [bt]);
          }
        }
        if (isListingBoatFlow && boatDoc?.exists) {
          const lb = boatDoc.data() as ListingBoat;
          rateForPricing = {
            ...rate,
            priceCents: getEffectiveBoatRatePriceCents(
              rate as {
                durationHours: number;
                priceCents: number;
                priceWeekendCents?: number;
                priceFriSunCents?: number;
                priceHolidayCents?: number;
              },
              slotStart,
              experience.holidayDates,
              lb.priceOverrides,
              calendarRates,
              experience.weekendDays,
              experience.friSunDays
            ),
          };
        } else {
          rateForPricing = {
            ...rate,
            priceCents: getEffectiveRatePriceCents(
              rate as { priceCents: number; priceWeekendCents?: number; priceFriSunCents?: number; priceHolidayCents?: number },
              slotStart,
              experience.holidayDates,
              experience.weekendDays,
              experience.friSunDays
            ),
          };
        }
      }
    }
  }
  const ticketQty =
    (hold as { bookingMode?: string }).bookingMode === "shared"
      ? Math.max(1, Math.floor(Number(hold.partySize ?? 1)))
      : 1;
  const pricing = computePricing({ rate: rateForPricing, addons: addonsForPricing, currency: "usd", qty: ticketQty });
  const ticketQtyForLineItems = isSharedTicketed ? Math.max(1, Math.floor(Number(hold.partySize ?? 1))) : undefined;

  return {
    pricing,
    rateForPricing,
    addonsForPricing,
    useSnapshotLineItems: false,
    ticketQtyForLineItems,
  };
}
