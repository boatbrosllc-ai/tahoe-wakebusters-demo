import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import {
  getSlotStartEnd,
  getCentralCalendarDayBounds,
  parseSlotId,
  parseSlotIdRelaxed,
  isAllowedSlotTime,
  toDateStrOnly,
  isSeasonalAllowed,
} from "@/lib/booking/experience-slots";
import { buildAddonSelectionsForPricing, computePricing, getEffectiveBoatRatePriceCents, getEffectiveRatePriceCents } from "@/lib/booking/pricing";
import { fetchMergedPricingCalendarRatesForBoatTypes } from "@/lib/booking/pricing-calendar-fetch";
import { validateAndApplyDiscount } from "@/lib/booking/discount";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
import { getExperienceIdVariants, boatMatchesExperience, inferSlugFromTitle } from "@/lib/booking/experience-aliases";
import { getTicketedDepartureAndDuration, validateTicketedSlotParsed, type RateDocLike } from "@/lib/booking/ticketed-slot-utils";
import { getDepartureInventoryRef, reserveCapacity, getReservedSeats, applyNetCapacityChange } from "@/lib/booking/shared-departure-inventory";
import { sharedHoldResumeHasActiveDiscount } from "@/lib/booking/hold-resume-discount";
import { hasOverlappingBlock, BlockCheckUnavailableError } from "@/lib/booking/has-overlapping-block";
import { assertSlotAvailable, SlotConflictError } from "@/lib/booking/slot-availability";
import type { CreateHoldInput, CreateHoldResponse, Discount } from "@/lib/booking/types";
import type { Boat, Rate, Addon, Slot, Hold } from "@/lib/booking/types";
import type { Experience, ExperienceRate, ExperienceAddon, ListingBoat, BoatRate } from "@/lib/booking/types";
import { signReleaseToken } from "@/lib/booking/releaseToken";
import { parseCreateHoldBody } from "@/lib/booking/create-hold-validation";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { bookingLog, bookingWarn, bookingError, generateIncidentCode } from "@/lib/booking/debug";
import { createHold503Payload, type CreateHold503Code } from "@/lib/booking/create-hold-errors";
import { isTransientFirestoreFailure } from "@/lib/booking/firestore-transient";
import {
  computeHoldRequestFingerprint,
  HOLD_REQUEST_CLAIMS_COLLECTION,
} from "@/lib/booking/hold-request-idempotency";
import { HOLD_EXPIRY_MINUTES } from "@/lib/booking/constants";

type ExperienceForTicketed = import("@/lib/booking/ticketed-slot-utils").ExperienceForTicketed;

function json503(incidentId: string, code: CreateHold503Code, error: string) {
  return NextResponse.json(createHold503Payload(incidentId, code, error), { status: 503 });
}

function validateTicketedSlotId(
  parsedForValidation: NonNullable<ReturnType<typeof parseSlotId>>,
  experience: Experience & ExperienceForTicketed,
  rate: ExperienceRate,
  ratesDocs: RateDocLike[],
  slotId: string,
  experienceId: string
): NextResponse | null {
  const expForTicketed: ExperienceForTicketed = {
    id: experienceId,
    slug: experience.slug,
    title: (experience as { title?: string }).title ?? (experience as { name?: string }).name,
    name: (experience as { name?: string }).name,
    pricingType: experience.pricingType,
    departureHour: (experience as { departureHour?: number }).departureHour,
    departureMinute: (experience as { departureMinute?: number }).departureMinute,
    tripDurationHours: (experience as { tripDurationHours?: number }).tripDurationHours,
    defaultRateId: (experience as { defaultRateId?: string }).defaultRateId,
  };
  const { deptHour, deptMinute, tripDuration } = getTicketedDepartureAndDuration(expForTicketed, ratesDocs);
  const rateDuration = typeof (rate as { durationHours?: number }).durationHours === "number" ? (rate as { durationHours: number }).durationHours : undefined;
  const valid = validateTicketedSlotParsed(parsedForValidation, deptHour, deptMinute, tripDuration, rateDuration);
  if (valid) return null;
  bookingWarn("create-hold", "ticketed slot validation failed", {
    parsedForValidation: {
      startHour: parsedForValidation.startHour,
      startMinute: parsedForValidation.startMinute,
      durationHours: parsedForValidation.durationHours,
    },
    expected: { deptHour, deptMinute, tripDuration },
    rateDuration,
    experienceTripDurationHours: (experience as { tripDurationHours?: number }).tripDurationHours,
    experienceId,
    slotId,
  });
  return NextResponse.json(
    {
      error: "Slot is not valid for this experience",
      expected: { departureHour: deptHour, departureMinute: deptMinute, durationHours: tripDuration },
      actual: {
        startHour: parsedForValidation.startHour,
        startMinute: parsedForValidation.startMinute,
        durationHours: parsedForValidation.durationHours,
      },
    },
    { status: 400 }
  );
}

export async function POST(request: NextRequest) {
  try {
    bookingLog("create-hold", "request started");
    const rl = await checkRateLimit(getClientKey(request));
    if (!rl.allowed) {
      if (rl.serverError) {
        const incidentId = generateIncidentCode();
        bookingWarn("create-hold", "rate limit service unavailable (503)", {
          incidentId,
          reason: "Redis unavailable or timeout; RATE_LIMIT_FAIL_CLOSED=1",
        });
        return json503(
          incidentId,
          "rate_limit_unavailable",
          "Service temporarily unavailable. Please try again shortly."
        );
      }
      bookingWarn("create-hold", "rate limit exceeded", { retryAfterMs: rl.retryAfterMs });
      const retryAfter = rl.retryAfterMs ? Math.ceil(rl.retryAfterMs / 1000) : 60;
      return NextResponse.json(
        { error: "Too many requests. Please try again in a moment." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
    if (rl.degraded) {
      bookingLog("create-hold", "rate limit degraded, request allowed", {});
    }
    const body = await request.json().catch(() => null);
    const parsed = parseCreateHoldBody(body);
    if (!parsed.input) {
      bookingLog("create-hold", "invalid body", { hint: parsed.hint });
      return NextResponse.json(
        { error: "Invalid request body", hint: parsed.hint },
        { status: 400 }
      );
    }
    const input = parsed.input;
    bookingLog("create-hold", "parsed input", {
      experienceId: input.experienceId ?? null,
      boatId: input.boatId ?? null,
      slotId: input.slotId,
      rateId: input.rateId,
      partySize: input.partySize,
      bookingMode: input.bookingMode,
      resumeHoldId: input.resumeHoldId ?? null,
    });
    let db: ReturnType<typeof getDb>;
    try {
      db = getDb();
    } catch (configErr) {
      const msg = configErr instanceof Error ? configErr.message : String(configErr);
      const isConfig = /Firebase config missing|FIREBASE_PRIVATE_KEY|Missing required env/i.test(msg);
      const incidentId = generateIncidentCode();
      bookingWarn("create-hold", "config error (503)", {
        incidentId,
        message: msg,
        hint: isConfig
          ? "Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY (or FIREBASE_SERVICE_ACCOUNT_JSON_PATH) in deployment."
          : "Service config missing or invalid.",
      });
      return json503(
        incidentId,
        "firebase_config_unavailable",
        "Service temporarily unavailable. Please try again shortly."
      );
    }
    const { FieldValue, Timestamp } = getFirestoreExports();
    const hasExperience = !!input.experienceId;
    const hasBoat = !!input.boatId;
    /** Reuse when boatId auto-resolution already read this doc (avoids duplicate experience fetch in listing-boat flow). */
    let cachedExperienceDoc: import("firebase-admin").firestore.DocumentSnapshot | null = null;
    // When the experience has listing boats, slots live under boats/{boatId}/slots. We must have boatId.
    // Exception: ticketed experiences don't require a boat — admin assigns boats later.
    // When there is exactly one listing boat, use it so the client doesn't have to send boatId.
    if (hasExperience && !hasBoat) {
      const expCheckDoc = await db.collection("experiences").doc(input.experienceId!).get();
      cachedExperienceDoc = expCheckDoc;
      const expCheckData = expCheckDoc.exists ? (expCheckDoc.data() as Experience) : null;
      const isTicketedExperience = expCheckData?.pricingType === "ticketed";
      if (!isTicketedExperience) {
        const listingBoatsSnap = await db
          .collection("boats")
          .where("isListingBoat", "==", true)
          .where("active", "==", true)
          .where("experienceIds", "array-contains", input.experienceId)
          .limit(2)
          .get();
        const count = listingBoatsSnap.size;
        if (count === 1) {
          input.boatId = listingBoatsSnap.docs[0].id;
        } else if (count > 1) {
          return NextResponse.json(
            { error: "Please select a boat. This experience has multiple boats.", hint: "boatId is required." },
            { status: 400 }
          );
        }
      }
    }
    const hasBoatResolved = !!input.boatId;
    const isListingBoatFlow = hasExperience && hasBoatResolved; // experience slots + boat rates
    const isExperienceOnly = hasExperience && !hasBoatResolved;
    const isLegacyBoat = !hasExperience && hasBoatResolved;
    bookingLog("create-hold", "flow branch", {
      isListingBoatFlow,
      isExperienceOnly,
      isLegacyBoat,
    });
    let isSharedTicketed = false;
    let isCharterTicketed = false;

    let capacityMax: number;
    let slotsRef: import("firebase-admin").firestore.CollectionReference;
    let rate: Rate | ExperienceRate | BoatRate;
    let addonsById: Map<string, Addon | ExperienceAddon>;
    let slotRef: import("firebase-admin").firestore.DocumentReference;
    let slotStartForPricing: Date | null = null;
    let experienceForPricing: Experience | null = null;
    let listingBoatForPricing: ListingBoat | null = null;
    let calendarRatesForListingBoat: Record<string, number> | undefined = undefined;
    let slotStartForBlock: Date | null = null;
    let slotEndForBlock: Date | null = null;
    const expId = input.experienceId ?? "";

    if (isListingBoatFlow) {
      // Experience + listing boat: fetch all in parallel — all IDs known from request body (rates for ticketed duration resolution)
      const boatId = input.boatId!;
      const expFetch =
        cachedExperienceDoc && cachedExperienceDoc.id === expId
          ? Promise.resolve(cachedExperienceDoc)
          : db.collection("experiences").doc(expId).get();
      const [expDoc, boatDoc, rateDoc, addonsSnapPre, ratesSnap] = await Promise.all([
        expFetch,
        db.collection("boats").doc(boatId).get(),
        db.collection("experiences").doc(expId).collection("rates").doc(input.rateId).get(),
        db.collection("experiences").doc(expId).collection("addons").get(),
        db.collection("experiences").doc(expId).collection("rates").where("active", "==", true).get(),
      ]);
      if (!expDoc.exists) {
        return NextResponse.json({ error: "Experience not found" }, { status: 404 });
      }
      const experience = expDoc.data() as Experience;
      if (!experience.active) {
        return NextResponse.json({ error: "Experience not available" }, { status: 400 });
      }
      if (!boatDoc.exists) {
        return NextResponse.json({ error: "Boat not found" }, { status: 404 });
      }
      const boat = boatDoc.data() as ListingBoat & { active?: boolean };
      const expSlug = typeof experience.slug === "string" ? experience.slug.trim() : "";
      // When Firestore slug is missing, infer from title so boatMatchesExperience uses same variants as experience-detail/slots (boat may have experienceIds: ["watersports"] not doc id).
      const inferredSlugFromTitle = ((): string => {
        if (expSlug) return "";
        const t = (experience.title ?? (experience as { name?: string }).name ?? "").toLowerCase();
        if (/wake|surf|watersport|wakeboard|tube/.test(t)) return "watersports";
        if (/pontoon|tritoon|party/.test(t)) return "pontoon";
        if (/sunset|cruise/.test(t)) return "sunset";
        if (/holiday|festive/.test(t)) return "holiday";
        return "";
      })();
      const effectiveSlug = expSlug || inferredSlugFromTitle;
      if (boat.isListingBoat !== true || !boatMatchesExperience(boat, expId, effectiveSlug)) {
        return NextResponse.json({ error: "Boat not available for this experience" }, { status: 400 });
      }
      if (boat.active === false) {
        return NextResponse.json({ error: "Boat not available" }, { status: 400 });
      }
      listingBoatForPricing = boat;
      capacityMax = getMaxGuestsForExperience(experience);
      if (input.partySize < 1 || input.partySize > capacityMax) {
        return NextResponse.json({ error: experience.pricingType === "ticketed" ? "Ticket quantity exceeds capacity" : "Party size exceeds capacity" }, { status: 400 });
      }
      isSharedTicketed = experience.pricingType === "ticketed" && input.bookingMode === "shared";
      isCharterTicketed = experience.pricingType === "ticketed" && input.bookingMode !== "shared";
      if (!rateDoc.exists) {
        return NextResponse.json({ error: "Rate not found" }, { status: 404 });
      }
      rate = rateDoc.data() as ExperienceRate;
      if (!rate.active) {
        return NextResponse.json({ error: "Rate not available" }, { status: 400 });
      }
      {
        const parsedForValidation = (isSharedTicketed || isCharterTicketed)
          ? (parseSlotIdRelaxed(input.slotId) ?? parseSlotId(input.slotId))
          : parseSlotId(input.slotId);
        if (!parsedForValidation) {
          return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
        }
        if (isSharedTicketed || isCharterTicketed) {
          const errResp = validateTicketedSlotId(
            parsedForValidation,
            experience,
            rate as ExperienceRate,
            ratesSnap.docs,
            input.slotId,
            expId
          );
          if (errResp) return errResp;
        } else if (!isAllowedSlotTime(parsedForValidation.startHour, parsedForValidation.startMinute, parsedForValidation.durationHours, boat.allowedStartTimes)) {
          return NextResponse.json({ error: "Slot is outside the allowed booking window" }, { status: 400 });
        }
      }
      // Ticketed listing-boat uses virtual slot IDs (no doc under boats/{boatId}/slots). slotsRef is set for charter path but that path is guarded below.
      slotsRef = db.collection("boats").doc(boatId).collection("slots");
      const boatTypeForCalendar = typeof boat.boatType === "string" ? boat.boatType.trim() : "";
      let slotStart: Date;
      if (isSharedTicketed) {
        calendarRatesForListingBoat = boatTypeForCalendar
          ? await fetchMergedPricingCalendarRatesForBoatTypes(db, [boatTypeForCalendar])
          : undefined;
        const parsedShared = parseSlotIdRelaxed(input.slotId) ?? parseSlotId(input.slotId);
        if (!parsedShared) {
          return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
        }
        const { start, end } = getSlotStartEnd(
          parsedShared.dateStr,
          parsedShared.startHour,
          parsedShared.durationHours,
          parsedShared.startMinute ?? 0
        );
        slotStart = start;
        slotStartForBlock = start;
        slotEndForBlock = end;
        // Shared ticketed holds use per-departure inventory; no slot doc is written. _noop must never appear in the charter transaction.
        slotRef = db.collection("holds").doc("_noop");
      } else {
        slotRef = slotsRef.doc(input.slotId);
        const [slotDoc, calMerged] = await Promise.all([
          slotRef.get(),
          boatTypeForCalendar
            ? fetchMergedPricingCalendarRatesForBoatTypes(db, [boatTypeForCalendar])
            : Promise.resolve(undefined),
        ]);
        calendarRatesForListingBoat = calMerged;
        if (slotDoc.exists) {
          const slotData = slotDoc.data() as Slot;
          slotStart = (slotData.startAt as { toDate(): Date }).toDate();
          slotStartForBlock = slotStart;
          slotEndForBlock = (slotData.endAt as { toDate(): Date }).toDate();
        } else {
          const parsed = parseSlotId(input.slotId);
          if (!parsed) {
            return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
          }
          if (rate.durationHours !== parsed.durationHours) {
            return NextResponse.json({ error: "Slot duration does not match rate" }, { status: 400 });
          }
          const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
          slotStart = start;
          slotStartForBlock = start;
          slotEndForBlock = end;
        }
      }
      const slotDateStrForSeasonal = parseSlotId(input.slotId)?.dateStr;
      if (!isSeasonalAllowed(experience.seasonal, slotStart, slotDateStrForSeasonal)) {
        return NextResponse.json({ error: "This experience is only available during its seasonal window" }, { status: 400 });
      }
      if (slotStart.getTime() < Date.now()) {
        return NextResponse.json({ error: "This time slot is in the past" }, { status: 400 });
      }
      slotStartForPricing = slotStart;
      experienceForPricing = experience;
      addonsById = new Map();
      addonsSnapPre.docs.forEach((d) => addonsById.set(d.id, d.data() as ExperienceAddon));
    } else if (isExperienceOnly) {
      // Fetch experience, rate, addons, and all active rates (for ticketed duration resolution) in parallel
      const [expDoc, rateDoc, addonsSnapPre, ratesSnapExp] = await Promise.all([
        db.collection("experiences").doc(expId).get(),
        db.collection("experiences").doc(expId).collection("rates").doc(input.rateId).get(),
        db.collection("experiences").doc(expId).collection("addons").get(),
        db.collection("experiences").doc(expId).collection("rates").where("active", "==", true).get(),
      ]);
      if (!expDoc.exists) {
        return NextResponse.json({ error: "Experience not found" }, { status: 404 });
      }
      const experience = expDoc.data() as Experience;
      if (!experience.active) {
        return NextResponse.json({ error: "Experience not available" }, { status: 400 });
      }
      capacityMax = getMaxGuestsForExperience(experience);
      if (input.partySize < 1 || input.partySize > capacityMax) {
        return NextResponse.json({ error: experience.pricingType === "ticketed" ? "Ticket quantity exceeds capacity" : "Party size exceeds capacity" }, { status: 400 });
      }
      isSharedTicketed = experience.pricingType === "ticketed" && input.bookingMode === "shared";
      isCharterTicketed = experience.pricingType === "ticketed" && input.bookingMode !== "shared";
      if (!rateDoc.exists) {
        return NextResponse.json({ error: "Rate not found" }, { status: 404 });
      }
      rate = rateDoc.data() as ExperienceRate;
      if (!rate.active) {
        return NextResponse.json({ error: "Rate not available" }, { status: 400 });
      }
      {
        const parsedForValidation = (isSharedTicketed || isCharterTicketed)
          ? (parseSlotIdRelaxed(input.slotId) ?? parseSlotId(input.slotId))
          : parseSlotId(input.slotId);
        if (!parsedForValidation) {
          return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
        }
        if (isSharedTicketed || isCharterTicketed) {
          const errResp = validateTicketedSlotId(
            parsedForValidation,
            experience,
            rate as ExperienceRate,
            ratesSnapExp.docs,
            input.slotId,
            expId
          );
          if (errResp) return errResp;
        } else if (!isAllowedSlotTime(parsedForValidation.startHour, parsedForValidation.startMinute, parsedForValidation.durationHours)) {
          return NextResponse.json({ error: "Slot is outside the allowed booking window" }, { status: 400 });
        }
      }
      slotsRef = db.collection("experiences").doc(expId).collection("slots");
      let slotStartExp: Date;
      if (isSharedTicketed) {
        const parsedShared = parseSlotIdRelaxed(input.slotId) ?? parseSlotId(input.slotId);
        if (!parsedShared) {
          return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
        }
        const { start, end } = getSlotStartEnd(
          parsedShared.dateStr,
          parsedShared.startHour,
          parsedShared.durationHours,
          parsedShared.startMinute ?? 0
        );
        slotStartExp = start;
        slotStartForBlock = start;
        slotEndForBlock = end;
        // Shared ticketed holds use per-departure inventory; no slot doc. _noop must never appear in the charter transaction.
        slotRef = db.collection("holds").doc("_noop");
      } else {
        slotRef = slotsRef.doc(input.slotId);
        const slotDocExp = await slotRef.get();
        if (slotDocExp.exists) {
          const slotData = slotDocExp.data() as Slot;
          slotStartExp = (slotData.startAt as { toDate(): Date }).toDate();
          slotStartForBlock = slotStartExp;
          slotEndForBlock = (slotData.endAt as { toDate(): Date }).toDate();
        } else {
          const parsed = parseSlotId(input.slotId);
          if (!parsed) {
            return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
          }
          // rateDoc already fetched in parallel above — no need to re-fetch
          const rateData = rateDoc.exists ? (rateDoc.data() as ExperienceRate) : null;
          if (!rateData || rateData.durationHours !== parsed.durationHours) {
            return NextResponse.json({ error: "Slot duration does not match rate" }, { status: 400 });
          }
          const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
          slotStartExp = start;
          slotStartForBlock = start;
          slotEndForBlock = end;
        }
      }
      const slotDateStrForSeasonal = parseSlotId(input.slotId)?.dateStr;
      if (!isSeasonalAllowed(experience.seasonal, slotStartExp, slotDateStrForSeasonal)) {
        return NextResponse.json({ error: "This experience is only available during its seasonal window" }, { status: 400 });
      }
      if (slotStartExp.getTime() < Date.now()) {
        return NextResponse.json({ error: "This time slot is in the past" }, { status: 400 });
      }
      slotStartForPricing = slotStartExp;
      experienceForPricing = experience;
      addonsById = new Map();
      addonsSnapPre.docs.forEach((d) => addonsById.set(d.id, d.data() as ExperienceAddon));
    } else {
      // Legacy boat flow: fetch boat, rate, and addons in parallel
      const boatId = input.boatId!;
      const [boatDoc, rateDoc, addonsSnap] = await Promise.all([
        db.collection("boats").doc(boatId).get(),
        db.collection("boats").doc(boatId).collection("rates").doc(input.rateId).get(),
        db.collection("boats").doc(boatId).collection("addons").get(),
      ]);
      if (!boatDoc.exists) {
        return NextResponse.json({ error: "Boat not found" }, { status: 404 });
      }
      const boat = boatDoc.data() as Boat;
      if (!boat.active) {
        return NextResponse.json({ error: "Boat not available" }, { status: 400 });
      }
      capacityMax = boat.capacityMax;
      if (input.partySize > capacityMax) {
        return NextResponse.json({ error: "Party size exceeds capacity" }, { status: 400 });
      }
      if (!rateDoc.exists) {
        return NextResponse.json({ error: "Rate not found" }, { status: 404 });
      }
      rate = rateDoc.data() as Rate;
      if (!rate.active) {
        return NextResponse.json({ error: "Rate not available" }, { status: 400 });
      }
      const parsedSlotLegacy = parseSlotId(input.slotId);
      if (!parsedSlotLegacy) {
        return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
      }
      if (!isAllowedSlotTime(parsedSlotLegacy.startHour, parsedSlotLegacy.startMinute, parsedSlotLegacy.durationHours, undefined)) {
        return NextResponse.json({ error: "Slot is outside the allowed booking window" }, { status: 400 });
      }
      addonsById = new Map<string, Addon>();
      addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as Addon));
      slotsRef = db.collection("boats").doc(boatId).collection("slots");
      slotRef = slotsRef.doc(input.slotId);
    }

    for (const s of input.addonSelections) {
      const addon = addonsById.get(s.addonId);
      if (!addon) continue;
      const maxQty = "maxQty" in addon && typeof (addon as { maxQty?: number }).maxQty === "number" ? (addon as { maxQty: number }).maxQty : undefined;
      if (maxQty != null && s.qty > maxQty) {
        return NextResponse.json(
          { error: `Addon quantity exceeds maximum of ${maxQty} for this add-on`, hint: `addonId: ${s.addonId}` },
          { status: 400 }
        );
      }
    }
    const addonsForPricing = buildAddonSelectionsForPricing(input.addonSelections, addonsById);
    let rateForPricing: typeof rate & { priceCents: number } = rate as typeof rate & { priceCents: number };
    if (experienceForPricing && slotStartForPricing && "priceCents" in rate) {
      if (isListingBoatFlow && listingBoatForPricing) {
        const effectivePriceCents = getEffectiveBoatRatePriceCents(
          rate as {
            durationHours: number;
            priceCents: number;
            priceWeekendCents?: number;
            priceFriSunCents?: number;
            priceHolidayCents?: number;
          },
          slotStartForPricing,
          experienceForPricing.holidayDates,
          listingBoatForPricing.priceOverrides,
          calendarRatesForListingBoat,
          experienceForPricing.weekendDays,
          experienceForPricing.friSunDays
        );
        rateForPricing = { ...rate, priceCents: effectivePriceCents } as typeof rate & { priceCents: number };
      } else {
        const effectivePriceCents = getEffectiveRatePriceCents(
          rate as { priceCents: number; priceWeekendCents?: number; priceFriSunCents?: number; priceHolidayCents?: number; durationHours?: number },
          slotStartForPricing,
          experienceForPricing.holidayDates,
          experienceForPricing.weekendDays,
          experienceForPricing.friSunDays
        );
        rateForPricing = { ...rate, priceCents: effectivePriceCents } as typeof rate & { priceCents: number };
      }
    }
    const pricing = computePricing({
      rate: rateForPricing,
      addons: addonsForPricing,
      currency: "usd",
      qty: isSharedTicketed ? input.partySize : 1,
    });
    if (pricing.subtotalCents === 0 && experienceForPricing?.pricingType === "ticketed") {
      return NextResponse.json(
        { error: "Rate has a zero or missing price - check the Firestore rate document." },
        { status: 400 }
      );
    }
    const tipCents = input.tipCents ?? 0;
    const maxTipCents = Math.round(pricing.subtotalCents * 0.35);
    if (tipCents > maxTipCents) {
      return NextResponse.json(
        { error: `Tip cannot exceed 35% of the booking subtotal before tax (maximum ${(maxTipCents / 100).toFixed(2)} for this booking).` },
        { status: 400 }
      );
    }
    let discountCents = 0;
    let discountCodeApplied: string | undefined;
    let discountRef: import("firebase-admin").firestore.DocumentReference | null = null;
    if (input.discountCode) {
      const discountSnap = await db.collection("discounts").where("code", "==", input.discountCode).limit(1).get();
      const discountDoc = discountSnap.empty ? null : (discountSnap.docs[0].data() as import("@/lib/booking/types").Discount);
      // Discount base = pre-tip subtotal (rate + addons + tax) per contract with validate-discount.
      const result = validateAndApplyDiscount(discountDoc, pricing.totalCents);
      if (!result.valid) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      discountCents = result.discountCents;
      discountCodeApplied = result.discount.code;
      if (!discountSnap.empty) discountRef = discountSnap.docs[0].ref;
    }
    const totalCentsWithTip = Math.max(0, pricing.totalCents + tipCents - discountCents);
    bookingLog("create-hold", "pricing computed", {
      totalCents: pricing.totalCents,
      tipCents,
      discountCents,
      totalCentsWithTip,
      discountCodeApplied: discountCodeApplied ?? null,
    });
    const holdId = db.collection("holds").doc().id;
    const holdRequestFingerprint = input.holdRequestId ? computeHoldRequestFingerprint(input) : null;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + HOLD_EXPIRY_MINUTES * 60 * 1000);

    const parsedSlotForHold = parseSlotId(input.slotId);
    const addonSelectionsSnapshot = input.addonSelections.map((s) => {
      const addon = addonsById.get(s.addonId);
      const priceCents =
        addon && typeof (addon as { priceCents?: number }).priceCents === "number"
          ? Math.max(0, Math.floor((addon as { priceCents: number }).priceCents))
          : 0;
      const name =
        addon && typeof (addon as { name?: string }).name === "string" ? (addon as { name: string }).name.trim() : "";
      return {
        addonId: s.addonId,
        qty: s.qty,
        priceCents,
        ...(name ? { name } : {}),
      };
    });
    const holdPayload: Record<string, unknown> = {
      slotId: input.slotId,
      ...(parsedSlotForHold ? { startDateStr: parsedSlotForHold.dateStr } : {}),
      rateId: input.rateId,
      addonSelections: addonSelectionsSnapshot,
      partySize: input.partySize,
      petsCount: input.petsCount,
      answers: input.answers,
      customerDraft: input.customerDraft,
      marketingOptIn: input.marketingOptIn,
      status: "active",
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: FieldValue.serverTimestamp(),
      paymentAttemptVersion: 1,
    };
    if (input.experienceId) holdPayload.experienceId = input.experienceId;
    if (input.boatId) holdPayload.boatId = input.boatId;
    if (experienceForPricing?.pricingType) holdPayload.pricingType = experienceForPricing.pricingType;
    if (input.bookingMode) holdPayload.bookingMode = input.bookingMode;
    if (input.holdRequestId) holdPayload.clientHoldRequestId = input.holdRequestId;
    if (tipCents > 0) holdPayload.tipCents = tipCents;
    if (discountCodeApplied && discountCents > 0) {
      holdPayload.discountCode = discountCodeApplied;
      holdPayload.discountCents = discountCents;
      if (discountRef) holdPayload.discountDocId = discountRef.id;
    }
    holdPayload.pricing = { ...pricing, currency: pricing.currency ?? "usd" };
    holdPayload.effectiveRateCents = rateForPricing.priceCents;

    let reusedHoldId: string | null = null;
    let reusedExpiresAt: Date | null = null;

    if (isSharedTicketed) {
      if (!input.experienceId) {
        throw new Error("Internal: experienceId required for shared ticketed flow");
      }
      const expIdForCapacity = input.experienceId;
      const parsedForCapacity = parseSlotIdRelaxed(input.slotId) ?? parseSlotId(input.slotId);
      if (!parsedForCapacity) {
        return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
      }
      bookingLog("create-hold", "shared ticketed: reserving capacity and creating hold", { holdId, experienceId: expIdForCapacity, dateStr: parsedForCapacity.dateStr, resumeHoldId: input.resumeHoldId ?? null });
      const dateStr = parsedForCapacity.dateStr;
      // isListingBoatFlow uses experience.maxCapacity when set; isExperienceOnly uses capacityMax directly.
      const sharedCapacityLimit = isListingBoatFlow
        ? ((experienceForPricing as Experience).maxCapacity ?? capacityMax)
        : capacityMax;
      // Slug variants cover legacy bookings stored under alternate experienceId values (e.g. "pontoon" slug).
      const expSlug = experienceForPricing && typeof (experienceForPricing as Experience).slug === "string"
        ? ((experienceForPricing as Experience).slug as string).trim()
        : "";
      const slugVariantsList = getExperienceIdVariants(expIdForCapacity, expSlug);
      const inventoryRef = getDepartureInventoryRef(db, expIdForCapacity, dateStr);
      const { start: slotStartForBlock, end: slotEndForBlock } = getSlotStartEnd(
        dateStr,
        parsedForCapacity.startHour,
        parsedForCapacity.durationHours,
        parsedForCapacity.startMinute ?? 0
      );
      if (slotStartForBlock.getTime() < Date.now()) {
        return NextResponse.json({ error: "This time slot is in the past" }, { status: 400 });
      }
      let effectiveHoldId = holdId;
      let effectiveExpiresAt = expiresAt;
      const sharedDiscountOut = { cents: discountCents };
      await db.runTransaction(async (tx) => {
        let claimRef: import("firebase-admin").firestore.DocumentReference | null = null;
        let resumeTargetId: string | null =
          input.resumeHoldId && input.resumeHoldId.trim() ? input.resumeHoldId.trim() : null;
        if (input.holdRequestId && holdRequestFingerprint) {
          claimRef = db.collection(HOLD_REQUEST_CLAIMS_COLLECTION).doc(input.holdRequestId);
          const claimSnap = await tx.get(claimRef);
          if (claimSnap.exists) {
            const c = claimSnap.data() as { requestFingerprint?: string; holdId?: string };
            if (c.requestFingerprint !== holdRequestFingerprint) {
              throw new Error("HOLD_REQUEST_ID_PAYLOAD_CONFLICT");
            }
            const claimedHoldId = typeof c.holdId === "string" && c.holdId.trim() ? c.holdId.trim() : null;
            if (claimedHoldId) {
              const claimedHoldSnap = await tx.get(db.collection("holds").doc(claimedHoldId));
              if (claimedHoldSnap.exists) {
                const ch = claimedHoldSnap.data() as Hold & { expiresAt?: { toDate?: () => Date; seconds?: number } };
                const cexp = ch.expiresAt;
                const cexpiry =
                  cexp?.toDate?.() ?? (typeof cexp?.seconds === "number" ? new Date(cexp.seconds * 1000) : new Date(0));
                const cActive = ch.status === "active" && cexpiry > now;
                const cSameExp = ch.experienceId === expIdForCapacity || slugVariantsList.includes(ch.experienceId ?? "");
                const cSameSlot = ch.slotId === input.slotId;
                const cSameMode = ch.bookingMode === "shared";
                if (cActive && cSameExp && cSameSlot && cSameMode) {
                  if (resumeTargetId && resumeTargetId !== claimedHoldId) {
                    throw new Error("HOLD_REQUEST_RESUME_MISMATCH");
                  }
                  resumeTargetId = claimedHoldId;
                }
              }
            }
          } else {
            tx.set(claimRef, {
              requestFingerprint: holdRequestFingerprint,
              createdAt: FieldValue.serverTimestamp(),
            });
          }
        }
        // Single per-departure inventory doc is read and updated so concurrent requests conflict and retry safely.
        const bookingQueries: Promise<import("firebase-admin").firestore.QuerySnapshot>[] = [
          tx.get(db.collection("bookings").where("experienceId", "==", expIdForCapacity).where("startDateStr", "==", dateStr)),
          ...slugVariantsList.map(v => tx.get(db.collection("bookings").where("experienceId", "==", v).where("startDateStr", "==", dateStr))),
        ];
        const bookSnaps = await Promise.all(bookingQueries);
        const seenBIds = new Set<string>();
        let sold = 0;
        for (const snap of bookSnaps) {
          for (const doc of snap.docs) {
            if (seenBIds.has(doc.id)) continue;
            seenBIds.add(doc.id);
            const b = doc.data() as { partySize?: number; status?: string; bookingMode?: string };
            if (typeof b.partySize !== "number") continue;
            if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
            if (b.bookingMode === "charter") throw new Error("This departure is reserved as a private charter");
            sold += b.partySize;
          }
        }

        if (!resumeTargetId && input.holdRequestId) {
          const idemSnap = await tx.get(
            db.collection("holds").where("clientHoldRequestId", "==", input.holdRequestId).limit(2)
          );
          for (const d of idemSnap.docs) {
            const h = d.data() as Hold & { expiresAt?: { toDate?: () => Date; seconds?: number } };
            const exp = h.expiresAt;
            const expiryDate = exp?.toDate?.() ?? (typeof exp?.seconds === "number" ? new Date(exp.seconds * 1000) : new Date(0));
            const isActive = h.status === "active" && expiryDate > now;
            const sameExperience = h.experienceId === expIdForCapacity || slugVariantsList.includes(h.experienceId ?? "");
            const sameSlot = h.slotId === input.slotId;
            const sameMode = h.bookingMode === "shared";
            if (isActive && sameExperience && sameSlot && sameMode) {
              resumeTargetId = d.id;
              break;
            }
          }
        }

        // Honor resumeHoldId / holdRequestId: reuse existing hold when valid to avoid duplicate holds on double-submit.
        if (resumeTargetId) {
          const existingHoldSnap = await tx.get(db.collection("holds").doc(resumeTargetId));
          if (existingHoldSnap.exists) {
            const existingHold = existingHoldSnap.data() as Hold & { expiresAt?: { toDate?: () => Date; seconds?: number } };
            const exp = existingHold.expiresAt;
            const expiryDate = exp?.toDate?.() ?? (typeof exp?.seconds === "number" ? new Date(exp.seconds * 1000) : new Date(0));
            const isActive = existingHold.status === "active" && expiryDate > now;
            const sameExperience = existingHold.experienceId === expIdForCapacity || slugVariantsList.includes(existingHold.experienceId ?? "");
            const sameSlot = existingHold.slotId === input.slotId;
            const sameMode = existingHold.bookingMode === "shared";
            if (isActive && sameExperience && sameSlot && sameMode) {
              const oldPartySize = typeof existingHold.partySize === "number" ? existingHold.partySize : 0;
              const delta = input.partySize - oldPartySize;
              // When resuming with a different discount (or none), decrement the old discount's usedCount so it is not permanently over-incremented.
              const oldDiscountCode = (existingHold as { discountCode?: string }).discountCode;
              if (oldDiscountCode && oldDiscountCode !== discountCodeApplied) {
                const oldDiscountSnap = await tx.get(db.collection("discounts").where("code", "==", oldDiscountCode).limit(1));
                if (!oldDiscountSnap.empty) {
                  const d = oldDiscountSnap.docs[0].data() as { usedCount?: number };
                  const nextCount = Math.max(0, (d.usedCount ?? 0) - 1);
                  tx.update(oldDiscountSnap.docs[0].ref, { usedCount: nextCount, updatedAt: FieldValue.serverTimestamp() });
                }
              }
              // When resuming with a new discount, validate and increment in same transaction to avoid redemption-limit bypass.
              if (discountRef && discountCodeApplied && discountCents > 0) {
                const newDiscountSnap = await tx.get(discountRef);
                if (newDiscountSnap.exists) {
                  const discountLive = newDiscountSnap.data() as Discount;
                  const recheck = validateAndApplyDiscount(discountLive, pricing.totalCents);
                  if (!recheck.valid) throw new Error(recheck.error);
                  if (recheck.discountCents !== discountCents || recheck.discount.code !== discountCodeApplied) {
                    throw new Error("Discount changed while booking; please try again");
                  }
                  const d = discountLive as { usedCount?: number; maxRedemptions?: number };
                  const used = d.usedCount ?? 0;
                  const max = d.maxRedemptions;
                  if (typeof max === "number" && used >= max) {
                    throw new Error("This code has reached its usage limit");
                  }
                  sharedDiscountOut.cents = recheck.discountCents;
                  tx.update(discountRef, { usedCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
                }
              }
              // Explicitly clear discount fields when no discount applies (mirror charter reuse path)
              // so resuming a previously discounted hold without a discount does not retain stale discount amounts.
              const discountUpdate =
                sharedHoldResumeHasActiveDiscount(discountCodeApplied, sharedDiscountOut.cents)
                  ? {
                      discountCode: discountCodeApplied,
                      discountCents: sharedDiscountOut.cents,
                      stripeCouponId: FieldValue.delete(),
                      ...(discountRef ? { discountDocId: discountRef.id } : {}),
                    }
                  : {
                      discountCode: FieldValue.delete(),
                      discountCents: FieldValue.delete(),
                      stripeCouponId: FieldValue.delete(),
                      discountDocId: FieldValue.delete(),
                    };
              const tipUpdate =
                typeof tipCents === "number" && Number.isInteger(tipCents) && tipCents >= 0
                  ? { tipCents }
                  : { tipCents: FieldValue.delete() };
              const holdUpdatePayload = {
                addonSelections: addonSelectionsSnapshot,
                partySize: input.partySize,
                petsCount: input.petsCount,
                answers: input.answers,
                customerDraft: input.customerDraft,
                marketingOptIn: input.marketingOptIn,
                expiresAt: Timestamp.fromDate(expiresAt),
                ...tipUpdate,
                ...(holdPayload.pricing ? { pricing: holdPayload.pricing } : {}),
                ...(holdPayload.effectiveRateCents != null ? { effectiveRateCents: holdPayload.effectiveRateCents } : {}),
                ...discountUpdate,
                paymentAttemptVersion: FieldValue.increment(1),
                depositPaymentIntentId: FieldValue.delete(),
                fullPaymentIntentId: FieldValue.delete(),
                checkoutSessionId: FieldValue.delete(),
              };
              if (delta === 0) {
                // No capacity change: just refresh hold (expiry, pricing, etc.).
                tx.update(db.collection("holds").doc(resumeTargetId), holdUpdatePayload);
              } else {
                // Read inventory once, then apply net change in a single write (read-before-write).
                const currentReserved = await getReservedSeats(tx, inventoryRef);
                applyNetCapacityChange(tx, inventoryRef, sharedCapacityLimit, sold, currentReserved, delta);
                tx.update(db.collection("holds").doc(resumeTargetId), holdUpdatePayload);
              }
              effectiveHoldId = resumeTargetId;
              effectiveExpiresAt = expiresAt;
              if (claimRef) {
                tx.set(claimRef, { holdId: effectiveHoldId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
              }
              return;
            }
          }
        }

        // No valid reusable hold: create new hold and reserve full party size.
        // Validate discount inside transaction and atomically increment to avoid over-redemption.
        if (discountRef && discountCodeApplied && discountCents > 0) {
          const discountSnapTx = await tx.get(discountRef);
          if (discountSnapTx.exists) {
            const discountLive = discountSnapTx.data() as Discount;
            const recheck = validateAndApplyDiscount(discountLive, pricing.totalCents);
            if (!recheck.valid) throw new Error(recheck.error);
            if (recheck.discountCents !== discountCents || recheck.discount.code !== discountCodeApplied) {
              throw new Error("Discount changed while booking; please try again");
            }
            const d = discountLive as { usedCount?: number; maxRedemptions?: number };
            const used = d.usedCount ?? 0;
            const max = d.maxRedemptions;
            if (typeof max === "number" && used >= max) {
              throw new Error("This code has reached its usage limit");
            }
            sharedDiscountOut.cents = recheck.discountCents;
            holdPayload.discountCents = recheck.discountCents;
            tx.update(discountRef, { usedCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
          }
        }
        const blocked = await hasOverlappingBlock({
          db,
          Timestamp,
          experienceId: expIdForCapacity,
          experienceIdVariants: slugVariantsList,
          boatId: isListingBoatFlow ? input.boatId : undefined,
          slotStart: slotStartForBlock,
          slotEnd: slotEndForBlock,
          get: (q) => tx.get(q),
        });
        if (blocked) throw new SlotConflictError("This slot is blocked");
        await reserveCapacity(tx, inventoryRef, sharedCapacityLimit, input.partySize, sold);
        tx.set(db.collection("holds").doc(holdId), holdPayload);
        if (claimRef) {
          tx.set(claimRef, { holdId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }
      });
      const responsePricing = { ...pricing, totalCents: totalCentsWithTip };
      const releaseToken = signReleaseToken(effectiveHoldId, Math.floor(effectiveExpiresAt.getTime() / 1000));
      const response: CreateHoldResponse = {
        holdId: effectiveHoldId,
        expiresAt: effectiveExpiresAt.toISOString(),
        pricing: responsePricing,
        ...(releaseToken ? { releaseToken } : {}),
        ...(discountCodeApplied ? { discountCents: sharedDiscountOut.cents, discountCode: discountCodeApplied } : {}),
      };
      bookingLog("create-hold", "shared ticketed hold created", { holdId: effectiveHoldId, expiresAt: effectiveExpiresAt.toISOString(), reused: effectiveHoldId !== holdId });
      return NextResponse.json(response);
    }

    const experienceIdVariantsForAssert =
      input.experienceId && experienceForPricing
        ? getExperienceIdVariants(
            input.experienceId,
            typeof (experienceForPricing as Experience).slug === "string"
              ? (experienceForPricing as Experience).slug.trim()
              : ""
          )
        : [];

    if (isSharedTicketed) {
      throw new Error("Unexpected: charter transaction reached for shared ticketed flow");
    }

    bookingLog("create-hold", "charter/legacy: starting transaction (slot hold + hold doc)");
    const charterDiscountOut = { cents: discountCents };
    await db.runTransaction(async (tx) => {
      let claimRef: import("firebase-admin").firestore.DocumentReference | null = null;
      let effectiveResumeHoldId: string | null =
        input.resumeHoldId && input.resumeHoldId.trim() ? input.resumeHoldId.trim() : null;
      if (input.holdRequestId && holdRequestFingerprint) {
        claimRef = db.collection(HOLD_REQUEST_CLAIMS_COLLECTION).doc(input.holdRequestId);
        const claimSnap = await tx.get(claimRef);
        if (claimSnap.exists) {
          const c = claimSnap.data() as { requestFingerprint?: string; holdId?: string };
          if (c.requestFingerprint !== holdRequestFingerprint) {
            throw new Error("HOLD_REQUEST_ID_PAYLOAD_CONFLICT");
          }
          const claimedHoldId = typeof c.holdId === "string" && c.holdId.trim() ? c.holdId.trim() : null;
          if (claimedHoldId) {
            const chSnap = await tx.get(db.collection("holds").doc(claimedHoldId));
            if (chSnap.exists) {
              const ch = chSnap.data() as Hold & { expiresAt?: { toDate?: () => Date; seconds?: number } };
              const cexp = ch.expiresAt;
              const cexpiry =
                cexp?.toDate?.() ?? (typeof cexp?.seconds === "number" ? new Date(cexp.seconds * 1000) : new Date(0));
              const cActive = ch.status === "active" && cexpiry > now;
              const cSameSlot = ch.slotId === input.slotId;
              const cCharterHold = ch.bookingMode !== "shared";
              const cSameExp = !input.experienceId || ch.experienceId === input.experienceId;
              const cSameBoat = !input.boatId || ch.boatId === input.boatId;
              if (cActive && cSameSlot && cCharterHold && cSameExp && cSameBoat) {
                if (effectiveResumeHoldId && effectiveResumeHoldId !== claimedHoldId) {
                  throw new Error("HOLD_REQUEST_RESUME_MISMATCH");
                }
                effectiveResumeHoldId = claimedHoldId;
              }
            }
          }
        } else {
          tx.set(claimRef, {
            requestFingerprint: holdRequestFingerprint,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      }
      const slotSnap = await tx.get(slotRef);
      if (slotSnap.exists) {
        const slot = slotSnap.data() as Slot;
        const slotStartDate = (slot.startAt as { toDate(): Date }).toDate();
        const slotEndDate = (slot.endAt as { toDate(): Date }).toDate();
        if (slot.status !== "open") {
          if (slot.status === "held" && slot.holdId) {
            const existingHoldSnap = await tx.get(db.collection("holds").doc(slot.holdId));
            if (existingHoldSnap.exists) {
              const existingHold = existingHoldSnap.data() as Hold & { expiresAt?: { toDate?: () => Date; seconds?: number } };
              const exp = existingHold.expiresAt;
              const expiryDate =
                exp?.toDate?.() ?? (typeof exp?.seconds === "number" ? new Date(exp.seconds * 1000) : new Date(0));
              const isStillActive = existingHold.status === "active" && expiryDate > now;
                if (isStillActive) {
                // Only allow extension when the caller proves they own this hold.
                // Any other request gets a 409 — never overwrite another customer's hold.
                if (effectiveResumeHoldId !== slot.holdId) {
                  throw new Error("Slot no longer available");
                }
                const newExpiresAt = new Date(now.getTime() + HOLD_EXPIRY_MINUTES * 60 * 1000);
                reusedHoldId = slot.holdId;
                reusedExpiresAt = newExpiresAt;
                // When resuming with a different discount (or none), decrement the old discount's usedCount.
                const existingHoldForCharter = existingHoldSnap.data() as Hold & { discountCode?: string };
                const oldDiscountCodeCharter = existingHoldForCharter.discountCode;
                if (oldDiscountCodeCharter && oldDiscountCodeCharter !== discountCodeApplied) {
                  const oldDiscountSnapCharter = await tx.get(db.collection("discounts").where("code", "==", oldDiscountCodeCharter).limit(1));
                  if (!oldDiscountSnapCharter.empty) {
                    const d = oldDiscountSnapCharter.docs[0].data() as { usedCount?: number };
                    const nextCount = Math.max(0, (d.usedCount ?? 0) - 1);
                    tx.update(oldDiscountSnapCharter.docs[0].ref, { usedCount: nextCount, updatedAt: FieldValue.serverTimestamp() });
                  }
                }
                // When resuming with a new discount, validate and increment in same transaction to avoid redemption-limit bypass.
                if (discountRef && discountCodeApplied && discountCents > 0) {
                  const newDiscountSnapCharter = await tx.get(discountRef);
                  if (newDiscountSnapCharter.exists) {
                    const discountLive = newDiscountSnapCharter.data() as Discount;
                    const recheck = validateAndApplyDiscount(discountLive, pricing.totalCents);
                    if (!recheck.valid) throw new Error(recheck.error);
                    if (recheck.discountCents !== discountCents || recheck.discount.code !== discountCodeApplied) {
                      throw new Error("Discount changed while booking; please try again");
                    }
                    const d = discountLive as { usedCount?: number; maxRedemptions?: number };
                    const used = d.usedCount ?? 0;
                    const max = d.maxRedemptions;
                    if (typeof max === "number" && used >= max) {
                      throw new Error("This code has reached its usage limit");
                    }
                    charterDiscountOut.cents = recheck.discountCents;
                    tx.update(discountRef, { usedCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
                  }
                }
                if (input.experienceId && parsedSlotForHold) {
                  await assertSlotAvailable({
                    db,
                    Timestamp,
                    get: (q) => tx.get(q),
                    experienceId: input.experienceId,
                    experienceIdVariants: experienceIdVariantsForAssert,
                    parsed: parsedSlotForHold,
                    slotStart: slotStartDate,
                    slotEnd: slotEndDate,
                    boatId: input.boatId,
                    useBoatSlots: isListingBoatFlow,
                    runSameDaySlotScan: false,
                  });
                }
                // Clear stage-specific payment intent IDs when reusing/extending a hold with mutated pricing
                // so stale intents (wrong amount) cannot be reused.
                // Reused-hold update must match what a new hold would persist: include all mutable checkout fields
                // and explicitly clear discount fields when no discount applies (avoid stale payer/discount state).
                const discountUpdate =
                  discountCodeApplied && charterDiscountOut.cents > 0
                    ? {
                        discountCode: discountCodeApplied,
                        discountCents: charterDiscountOut.cents,
                        stripeCouponId: FieldValue.delete(),
                        ...(discountRef ? { discountDocId: discountRef.id } : {}),
                      }
                    : {
                        discountCode: FieldValue.delete(),
                        discountCents: FieldValue.delete(),
                        stripeCouponId: FieldValue.delete(),
                        discountDocId: FieldValue.delete(),
                      };
                const tipUpdate =
                  typeof tipCents === "number" && Number.isInteger(tipCents) && tipCents >= 0
                    ? { tipCents }
                    : { tipCents: FieldValue.delete() };
                tx.update(db.collection("holds").doc(slot.holdId), {
                  addonSelections: addonSelectionsSnapshot,
                  partySize: input.partySize,
                  petsCount: input.petsCount,
                  answers: input.answers,
                  customerDraft: input.customerDraft,
                  marketingOptIn: input.marketingOptIn,
                  expiresAt: Timestamp.fromDate(newExpiresAt),
                  ...tipUpdate,
                  ...(holdPayload.pricing ? { pricing: holdPayload.pricing } : {}),
                  ...(holdPayload.effectiveRateCents != null ? { effectiveRateCents: holdPayload.effectiveRateCents } : {}),
                  ...discountUpdate,
                  paymentAttemptVersion: FieldValue.increment(1),
                  depositPaymentIntentId: FieldValue.delete(),
                  fullPaymentIntentId: FieldValue.delete(),
                  checkoutSessionId: FieldValue.delete(),
                });
                if (claimRef && slot.holdId) {
                  tx.set(claimRef, { holdId: slot.holdId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
                }
                return;
              }
              // Hold exists but expired or cancelled → treat slot as available, fall through to create new hold
            }
            // Slot doc says "booked" — only treat as taken if the booking still exists and is confirmed
          } else if (slot.status === "booked" && slot.bookingId) {
            const bookingSnap = await tx.get(db.collection("bookings").doc(slot.bookingId));
            if (bookingSnap.exists) {
              const b = bookingSnap.data() as { status?: string };
              if (b.status && BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) {
                throw new Error("Slot no longer available");
              }
            }
            // Booking missing or canceled/refunded → treat slot as available, fall through
          } else if (slot.status !== "held" || !slot.holdId) {
            throw new Error("Slot no longer available");
          }
        }
        if (input.experienceId && parsedSlotForHold) {
          await assertSlotAvailable({
            db,
            Timestamp,
            get: (q) => tx.get(q),
            experienceId: input.experienceId,
            experienceIdVariants: experienceIdVariantsForAssert,
            parsed: parsedSlotForHold,
            slotStart: slotStartDate,
            slotEnd: slotEndDate,
            boatId: input.boatId,
            useBoatSlots: isListingBoatFlow,
            runSameDaySlotScan: false,
          });
        }
        tx.update(slotRef, {
          status: "held",
          holdId,
          bookingId: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        if (!isExperienceOnly && !isListingBoatFlow) throw new Error("Slot not found");
        const parsed = parseSlotId(input.slotId);
        if (!parsed) throw new Error("Invalid slot");
        const { start: slotStartDate, end: slotEndDate } = getSlotStartEnd(
          parsed.dateStr,
          parsed.startHour,
          parsed.durationHours,
          parsed.startMinute ?? 0
        );
        const slotStartMs = slotStartDate.getTime();
        const slotEndMs = slotEndDate.getTime();
        // Prevent double-booking: reject if any existing held/booked/blocked slot overlaps this time
        const { dayStart, dayEnd } = getCentralCalendarDayBounds(parsed.dateStr);
        const checkSameDaySlotsForOverlap = async (
          sameDayDocs: import("firebase-admin").firestore.QueryDocumentSnapshot[]
        ) => {
          // Batch-prefetch all holds and bookings needed to determine true status — avoids N+1 reads.
          const heldDocs = sameDayDocs.filter(d => {
            const s = d.data() as Slot;
            return s.status === "held" && s.holdId;
          });
          const bookedDocs = sameDayDocs.filter(d => {
            const s = d.data() as Slot;
            return s.status === "booked" && s.bookingId;
          });
          const [holdSnaps, bookingSnaps] = await Promise.all([
            heldDocs.length
              ? Promise.all(heldDocs.map(d => tx.get(db.collection("holds").doc((d.data() as Slot).holdId as string))))
              : Promise.resolve([] as import("firebase-admin").firestore.DocumentSnapshot[]),
            bookedDocs.length
              ? Promise.all(bookedDocs.map(d => tx.get(db.collection("bookings").doc((d.data() as Slot).bookingId as string))))
              : Promise.resolve([] as import("firebase-admin").firestore.DocumentSnapshot[]),
          ]);
          const holdsById = new Map(heldDocs.map((d, i) => [(d.data() as Slot).holdId as string, holdSnaps[i]]));
          const bookingsById = new Map(bookedDocs.map((d, i) => [(d.data() as Slot).bookingId as string, bookingSnaps[i]]));

          for (const doc of sameDayDocs) {
            const data = doc.data() as Slot;
            if (data.status === "open") continue;
            if (data.status === "held") {
              if (!data.holdId) continue;
              const hSnap = holdsById.get(data.holdId);
              if (!hSnap?.exists) continue;
              const hold = hSnap.data() as { status?: string; expiresAt?: { toDate(): Date } };
              if (hold?.status !== "active") continue;
              const exp = hold?.expiresAt?.toDate?.();
              if (exp && exp <= now) continue;
            } else if (data.status === "booked") {
              if (!data.bookingId) continue;
              const bSnap = bookingsById.get(data.bookingId);
              if (!bSnap?.exists) continue;
              const b = bSnap.data() as { status?: string };
              if (!(b.status && BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never))) continue;
            }
            const existingStart = (data.startAt as { toDate(): Date }).toDate().getTime();
            const existingEnd = (data.endAt as { toDate(): Date }).toDate().getTime();
            if (slotStartMs < existingEnd && slotEndMs > existingStart) {
              throw new Error("Slot no longer available");
            }
          }
        };

        if (isListingBoatFlow && input.boatId) {
          const boatSlotsRef = db.collection("boats").doc(input.boatId).collection("slots");
          const sameDaySnap = await tx.get(
            boatSlotsRef
              .where("startAt", ">=", Timestamp.fromDate(dayStart))
              .where("startAt", "<=", Timestamp.fromDate(dayEnd))
          );
          await checkSameDaySlotsForOverlap(sameDaySnap.docs);
        } else if (isExperienceOnly && input.experienceId) {
          const expSlotsRef = db.collection("experiences").doc(input.experienceId).collection("slots");
          const sameDaySnap = await tx.get(
            expSlotsRef
              .where("startAt", ">=", Timestamp.fromDate(dayStart))
              .where("startAt", "<=", Timestamp.fromDate(dayEnd))
          );
          await checkSameDaySlotsForOverlap(sameDaySnap.docs);
        }
        if (input.experienceId && parsed) {
          await assertSlotAvailable({
            db,
            Timestamp,
            get: (q) => tx.get(q),
            experienceId: input.experienceId,
            experienceIdVariants: experienceIdVariantsForAssert,
            parsed,
            slotStart: slotStartDate,
            slotEnd: slotEndDate,
            boatId: input.boatId,
            useBoatSlots: isListingBoatFlow,
            runSameDaySlotScan: false,
          });
        }
        tx.set(slotRef, {
          startAt: Timestamp.fromDate(slotStartDate),
          endAt: Timestamp.fromDate(slotEndDate),
          status: "held",
          holdId,
          bookingId: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      // Validate discount inside transaction and atomically increment to avoid over-redemption.
      if (discountRef && discountCodeApplied && discountCents > 0) {
        const discountSnapTx = await tx.get(discountRef);
        if (discountSnapTx.exists) {
          const discountLive = discountSnapTx.data() as Discount;
          const recheck = validateAndApplyDiscount(discountLive, pricing.totalCents);
          if (!recheck.valid) throw new Error(recheck.error);
          if (recheck.discountCents !== discountCents || recheck.discount.code !== discountCodeApplied) {
            throw new Error("Discount changed while booking; please try again");
          }
          const d = discountLive as { usedCount?: number; maxRedemptions?: number };
          const used = d.usedCount ?? 0;
          const max = d.maxRedemptions;
          if (typeof max === "number" && used >= max) {
            throw new Error("This code has reached its usage limit");
          }
          charterDiscountOut.cents = recheck.discountCents;
          holdPayload.discountCents = recheck.discountCents;
          tx.update(discountRef, { usedCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
        }
      }
      tx.set(db.collection("holds").doc(holdId), holdPayload);
      if (claimRef) {
        tx.set(claimRef, { holdId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    });

    bookingLog("create-hold", "transaction completed", {
      holdId,
      reusedHoldId,
      expiresAt: (reusedHoldId != null && reusedExpiresAt != null ? reusedExpiresAt : expiresAt).toISOString(),
    });
    const responsePricing = {
      ...pricing,
      totalCents: totalCentsWithTip,
    };
    if (reusedHoldId != null && reusedExpiresAt != null) {
      const expiresAtDate = reusedExpiresAt as Date;
      const releaseToken = signReleaseToken(reusedHoldId, Math.floor(expiresAtDate.getTime() / 1000));
      const response: CreateHoldResponse = {
        holdId: reusedHoldId,
        expiresAt: expiresAtDate.toISOString(),
        pricing: responsePricing,
        ...(releaseToken ? { releaseToken } : {}),
        ...(discountCodeApplied ? { discountCents: charterDiscountOut.cents, discountCode: discountCodeApplied } : {}),
      };
      return NextResponse.json(response);
    }

    const releaseToken = signReleaseToken(holdId, Math.floor(expiresAt.getTime() / 1000));
    const response: CreateHoldResponse = {
      holdId,
      expiresAt: expiresAt.toISOString(),
      pricing: responsePricing,
      ...(releaseToken ? { releaseToken } : {}),
      ...(discountCodeApplied ? { discountCents: charterDiscountOut.cents, discountCode: discountCodeApplied } : {}),
    };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create hold failed";
    if (err instanceof BlockCheckUnavailableError) {
      const incidentId = generateIncidentCode();
      bookingWarn("create-hold", "block check unavailable (503)", {
        incidentId,
        hint: "Firestore blocks query failed (e.g. index missing or building).",
      });
      return json503(
        incidentId,
        "block_check_unavailable",
        "Unable to verify availability. Please try again shortly."
      );
    }
    if (message === "HOLD_REQUEST_ID_PAYLOAD_CONFLICT") {
      bookingLog("create-hold", "holdRequestId payload conflict (409)", {});
      return NextResponse.json(
        {
          error: "This booking request id was already used with different selections. Start over or change your details.",
          code: "hold_request_payload_mismatch",
        },
        { status: 409 }
      );
    }
    if (message === "HOLD_REQUEST_RESUME_MISMATCH") {
      bookingLog("create-hold", "holdRequestId resume mismatch (409)", {});
      return NextResponse.json(
        {
          error: "Hold resume does not match this booking request id.",
          code: "hold_request_resume_mismatch",
        },
        { status: 409 }
      );
    }
    if (
      err instanceof SlotConflictError ||
      message === "Slot not found" ||
      message === "Slot no longer available" ||
      message === "This slot is blocked" ||
      message === "This departure is reserved as a private charter" ||
      message === "Shared tickets have already been sold for this departure" ||
      message === "This code has reached its usage limit" ||
      message === "This date is sold out." ||
      message.startsWith("Only ")
    ) {
      bookingLog("create-hold", "conflict (409)", { message });
      const code409 =
        err instanceof SlotConflictError
          ? err.message === "This slot is blocked"
            ? "slot_blocked"
            : "slot_unavailable"
          : message === "Slot not found"
            ? "slot_not_found"
            : message === "Slot no longer available"
              ? "slot_unavailable"
              : message === "This slot is blocked"
                ? "slot_blocked"
                : message === "This departure is reserved as a private charter"
                  ? "departure_private_charter"
                  : message === "Shared tickets have already been sold for this departure"
                    ? "shared_tickets_sold"
                    : message === "This code has reached its usage limit"
                      ? "discount_limit"
                      : message === "This date is sold out."
                        ? "date_sold_out"
                        : message.startsWith("Only ")
                          ? "capacity"
                          : "slot_unavailable";
      return NextResponse.json({ error: message, code: code409 }, { status: 409 });
    }
    if (isTransientFirestoreFailure(err)) {
      const incidentId = generateIncidentCode();
      bookingWarn("create-hold", "transient Firestore / infrastructure (503)", {
        incidentId,
        message,
      });
      return json503(
        incidentId,
        "firestore_transient",
        "Service temporarily unavailable. Please try again in a moment."
      );
    }
    const incidentId = generateIncidentCode();
    bookingError("create-hold", "create hold failed", err, {
      message,
      incidentId,
      hint: /Firebase config missing|FIREBASE_PRIVATE_KEY|Missing required env/i.test(message)
        ? "Set Firebase and Stripe env vars in deployment (see docs/BOOKING_SETUP.md)."
        : undefined,
    });
    const isConfig = /Firebase config missing|FIREBASE_PRIVATE_KEY|Missing required env/i.test(message);
    if (isConfig) {
      return json503(
        incidentId,
        "firebase_config_unavailable",
        "Service temporarily unavailable. Please try again shortly."
      );
    }
    return NextResponse.json(
      {
        error: message || "Something went wrong. Please try again.",
        code: "internal_error",
        incidentId,
      },
      { status: 500 }
    );
  }
}
