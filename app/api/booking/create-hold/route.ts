import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getSlotStartEnd, parseSlotId, isAllowedSlotTime } from "@/lib/booking/experience-slots";
import { buildAddonSelectionsForPricing, computePricing, getEffectiveRatePriceCents } from "@/lib/booking/pricing";
import { validateAndApplyDiscount } from "@/lib/booking/discount";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
import { getExperienceIdVariants, boatMatchesExperience } from "@/lib/booking/experience-aliases";
import { getDepartureInventoryRef, reserveCapacity, releaseCapacity } from "@/lib/booking/shared-departure-inventory";
import type { CreateHoldInput, CreateHoldResponse } from "@/lib/booking/types";
import type { Boat, Rate, Addon, Slot, Hold } from "@/lib/booking/types";
import type { Experience, ExperienceRate, ExperienceAddon, ListingBoat, BoatRate } from "@/lib/booking/types";
import { signReleaseToken } from "@/lib/booking/releaseToken";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { bookingLog, bookingWarn, bookingError } from "@/lib/booking/debug";

const HOLD_EXPIRY_MINUTES = 10;

function parseBody(body: unknown): { input: CreateHoldInput; hint?: string } | { input: null; hint: string } {
  if (body == null || typeof body !== "object") {
    return { input: null, hint: "Request body must be a JSON object." };
  }
  const o = body as Record<string, unknown>;
  const boatId = typeof o.boatId === "string" ? o.boatId : null;
  const experienceId = typeof o.experienceId === "string" ? o.experienceId : null;
  const slotId = typeof o.slotId === "string" ? o.slotId : null;
  const rateId = typeof o.rateId === "string" ? o.rateId : null;
  const partySize = typeof o.partySize === "number" ? o.partySize : null;
  const petsCount = typeof o.petsCount === "number" ? o.petsCount : null;
  const marketingOptIn = typeof o.marketingOptIn === "boolean" ? o.marketingOptIn : false;
  const tipCents = typeof o.tipCents === "number" && o.tipCents >= 0 ? o.tipCents : undefined;
  const discountCode = typeof o.discountCode === "string" ? o.discountCode.trim().toUpperCase() : undefined;
  const missing: string[] = [];
  if (!boatId && !experienceId) missing.push("experienceId or boatId");
  if (!slotId) missing.push("slotId");
  if (!rateId) missing.push("rateId");
  if (partySize == null) missing.push("partySize (number)");
  const customerDraft = o.customerDraft as { name?: string; email?: string; phone?: string } | undefined;
  if (!customerDraft || typeof customerDraft !== "object") {
    missing.push("customerDraft (object with name, email, phone)");
  } else {
    if (typeof customerDraft.name !== "string") missing.push("customerDraft.name");
    if (typeof customerDraft.email !== "string") missing.push("customerDraft.email");
    else {
      const email = (customerDraft.email as string).trim();
      if (email.length > 254) missing.push("customerDraft.email (must be at most 254 characters)");
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) missing.push("customerDraft.email (must be a valid email format)");
    }
    if (typeof customerDraft.phone !== "string") missing.push("customerDraft.phone");
  }
  if (missing.length) {
    return { input: null, hint: `Missing or invalid: ${missing.join(", ")}.` };
  }
  const addonSelections = Array.isArray(o.addonSelections)
    ? (o.addonSelections as { addonId: string; qty: number }[]).filter(
        (s) => typeof s.addonId === "string" && typeof s.qty === "number"
      )
    : [];
  const answers = o.answers != null && typeof o.answers === "object" ? (o.answers as Record<string, string>) : {};
  const bookingMode: "shared" | "charter" = o.bookingMode === "shared" ? "shared" : "charter";
  const resumeHoldId = typeof o.resumeHoldId === "string" && o.resumeHoldId.trim() ? o.resumeHoldId.trim() : undefined;
  return {
    input: {
      boatId: boatId ?? undefined,
      experienceId: experienceId ?? undefined,
      slotId: slotId!,
      rateId: rateId!,
      addonSelections,
      partySize: partySize!,
      petsCount: petsCount ?? 0,
      answers,
      customerDraft: {
        name: (customerDraft!.name as string).trim(),
        email: (customerDraft!.email as string).trim().slice(0, 254),
        phone: (customerDraft!.phone as string).trim(),
      },
      marketingOptIn,
      tipCents,
      discountCode: discountCode || undefined,
      bookingMode,
      resumeHoldId,
    },
  };
}

function toDateStrOnly(v: unknown): string | null {
  if (v == null) return null;
  const s = typeof v === "string" ? v.trim() : null;
  if (!s || s.length < 10) return null;
  const sliced = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(sliced) ? sliced : null;
}

function isSeasonalAllowed(exp: Experience, slotStart: Date, slotDateStr?: string): boolean {
  if (!exp.seasonal?.enabled) return true;
  const startDate = toDateStrOnly(exp.seasonal.startDate);
  const endDate = toDateStrOnly(exp.seasonal.endDate);
  if (startDate && endDate) {
    const dateStr = slotDateStr ?? slotStart.toISOString().slice(0, 10);
    return dateStr >= startDate && dateStr <= endDate;
  }
  const startMonth = exp.seasonal.startMonth ?? 1;
  const endMonth = exp.seasonal.endMonth ?? 12;
  const month = slotDateStr && /^\d{4}-\d{2}-\d{2}$/.test(slotDateStr)
    ? parseInt(slotDateStr.slice(5, 7), 10) || slotStart.getMonth() + 1
    : slotStart.getMonth() + 1;
  if (startMonth <= endMonth) return month >= startMonth && month <= endMonth;
  return month >= startMonth || month <= endMonth; // e.g. Nov (11) to Jan (1)
}

async function hasOverlappingBlock(opts: {
  db: ReturnType<typeof getDb>;
  Timestamp: ReturnType<typeof getFirestoreExports>["Timestamp"];
  experienceId: string;
  boatId?: string;
  slotStart: Date;
  slotEnd: Date;
  get?: (q: import("firebase-admin").firestore.Query) => Promise<import("firebase-admin").firestore.QuerySnapshot>;
}): Promise<boolean> {
  const { db, Timestamp, experienceId, slotStart, slotEnd, get } = opts;
  const boatId = typeof opts.boatId === "string" && opts.boatId.trim() ? opts.boatId.trim() : null;
  const slotStartMs = slotStart.getTime();
  const slotEndMs = slotEnd.getTime();
  if (!Number.isFinite(slotStartMs) || !Number.isFinite(slotEndMs) || slotEndMs <= slotStartMs) return false;

  const query = db
    .collection("blocks")
    .where("experienceId", "==", experienceId)
    .where("startAt", "<", Timestamp.fromDate(slotEnd));

  const getSnap = get ?? ((q: import("firebase-admin").firestore.Query) => q.get());
  const snap = await getSnap(query);
  for (const doc of snap.docs) {
    const b = doc.data() as { boatId?: string | null; endAt?: { toDate?: () => Date } };
    const blockBoatIdRaw = typeof b.boatId === "string" ? b.boatId.trim() : null;
    const blockBoatId = blockBoatIdRaw ? blockBoatIdRaw : null;
    const matchesBoat = boatId ? blockBoatId === boatId || blockBoatId == null : blockBoatId == null;
    if (!matchesBoat) continue;
    const endAt = b.endAt?.toDate?.();
    if (!endAt) continue;
    if (endAt.getTime() > slotStartMs) return true;
  }
  return false;
}

export async function POST(request: NextRequest) {
  try {
    bookingLog("create-hold", "request started");
    const rl = await checkRateLimit(getClientKey(request));
    if (!rl.allowed) {
      if (rl.serverError) {
        return NextResponse.json(
          { error: "Rate limit service temporarily unavailable. Please try again shortly." },
          { status: 503 }
        );
      }
      bookingWarn("create-hold", "rate limit exceeded", { retryAfterMs: rl.retryAfterMs });
      const retryAfter = rl.retryAfterMs ? Math.ceil(rl.retryAfterMs / 1000) : 60;
      return NextResponse.json(
        { error: "Too many requests. Please try again in a moment." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
    const body = await request.json().catch(() => null);
    const parsed = parseBody(body);
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
      bookingWarn("create-hold", "config error", { message: msg });
      return NextResponse.json(
        {
          error: isConfig ? "Booking is not configured." : "Service temporarily unavailable.",
          hint: isConfig
            ? "Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY (or FIREBASE_SERVICE_ACCOUNT_JSON_PATH) in your deployment environment."
            : undefined,
        },
        { status: 503 }
      );
    }
    const { FieldValue, Timestamp } = getFirestoreExports();
    const hasExperience = !!input.experienceId;
    const hasBoat = !!input.boatId;
    // When the experience has listing boats, slots live under boats/{boatId}/slots. We must have boatId.
    // Exception: ticketed experiences don't require a boat — admin assigns boats later.
    if (hasExperience && !hasBoat) {
      const expCheckDoc = await db.collection("experiences").doc(input.experienceId!).get();
      const expCheckData = expCheckDoc.exists ? (expCheckDoc.data() as Experience) : null;
      const isTicketedExperience = expCheckData?.pricingType === "ticketed";
      if (!isTicketedExperience) {
        const listingBoatsSnap = await db
          .collection("boats")
          .where("isListingBoat", "==", true)
          .where("active", "==", true)
          .where("experienceIds", "array-contains", input.experienceId)
          .limit(1)
          .get();
        if (!listingBoatsSnap.empty) {
          return NextResponse.json(
            { error: "Please select a boat. This experience has multiple boats.", hint: "boatId is required." },
            { status: 400 }
          );
        }
      }
    }
    const isListingBoatFlow = hasExperience && hasBoat; // experience slots + boat rates
    const isExperienceOnly = hasExperience && !hasBoat;
    const isLegacyBoat = !hasExperience && hasBoat;
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
    let slotStartForBlock: Date | null = null;
    let slotEndForBlock: Date | null = null;
    const expId = input.experienceId!;

    if (isListingBoatFlow) {
      // Experience + listing boat: fetch all in parallel — all IDs known from request body
      const boatId = input.boatId!;
      const [expDoc, boatDoc, rateDoc, addonsSnapPre] = await Promise.all([
        db.collection("experiences").doc(expId).get(),
        db.collection("boats").doc(boatId).get(),
        db.collection("experiences").doc(expId).collection("rates").doc(input.rateId).get(),
        db.collection("experiences").doc(expId).collection("addons").get(),
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
        const parsedForValidation = parseSlotId(input.slotId);
        if (!parsedForValidation) {
          return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
        }
        if (isSharedTicketed || isCharterTicketed) {
          // Align with slots API: use experience defaults and rate duration when experience.tripDurationHours is missing
          const deptHour = experience.departureHour ?? 10;
          const deptMinute = experience.departureMinute ?? 0;
          const tripDuration = experience.tripDurationHours ?? (rate as { durationHours?: number }).durationHours;
          if (
            tripDuration == null ||
            parsedForValidation.startHour !== deptHour ||
            parsedForValidation.startMinute !== deptMinute ||
            parsedForValidation.durationHours !== tripDuration
          ) {
            return NextResponse.json({ error: "Slot is not valid for this experience" }, { status: 400 });
          }
        } else if (!isAllowedSlotTime(parsedForValidation.startHour, parsedForValidation.startMinute, parsedForValidation.durationHours, boat.allowedStartTimes)) {
          return NextResponse.json({ error: "Slot is outside the allowed booking window" }, { status: 400 });
        }
      }
      slotsRef = db.collection("boats").doc(boatId).collection("slots");
      let slotStart: Date;
      if (isSharedTicketed) {
        const parsedShared = parseSlotId(input.slotId);
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
        slotRef = db.collection("holds").doc("_noop");
      } else {
        slotRef = slotsRef.doc(input.slotId);
        const slotDoc = await slotRef.get();
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
      if (!isSeasonalAllowed(experience, slotStart, slotDateStrForSeasonal)) {
        return NextResponse.json({ error: "This experience is only available during its seasonal window" }, { status: 400 });
      }
      slotStartForPricing = slotStart;
      experienceForPricing = experience;
      addonsById = new Map();
      addonsSnapPre.docs.forEach((d) => addonsById.set(d.id, d.data() as ExperienceAddon));
    } else if (isExperienceOnly) {
      // Fetch experience, rate, and addons in parallel — all IDs known from request body
      const [expDoc, rateDoc, addonsSnapPre] = await Promise.all([
        db.collection("experiences").doc(expId).get(),
        db.collection("experiences").doc(expId).collection("rates").doc(input.rateId).get(),
        db.collection("experiences").doc(expId).collection("addons").get(),
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
        const parsedForValidation = parseSlotId(input.slotId);
        if (!parsedForValidation) {
          return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
        }
        if (isSharedTicketed || isCharterTicketed) {
          // Align with slots API: use experience defaults and rate duration when experience.tripDurationHours is missing
          const deptHour = experience.departureHour ?? 10;
          const deptMinute = experience.departureMinute ?? 0;
          const tripDuration = experience.tripDurationHours ?? (rate as { durationHours?: number }).durationHours;
          if (
            tripDuration == null ||
            parsedForValidation.startHour !== deptHour ||
            parsedForValidation.startMinute !== deptMinute ||
            parsedForValidation.durationHours !== tripDuration
          ) {
            return NextResponse.json({ error: "Slot is not valid for this experience" }, { status: 400 });
          }
        } else if (!isAllowedSlotTime(parsedForValidation.startHour, parsedForValidation.startMinute, parsedForValidation.durationHours)) {
          return NextResponse.json({ error: "Slot is outside the allowed booking window" }, { status: 400 });
        }
      }
      slotsRef = db.collection("experiences").doc(expId).collection("slots");
      let slotStartExp: Date;
      if (isSharedTicketed) {
        const parsedShared = parseSlotId(input.slotId);
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
      if (!isSeasonalAllowed(experience, slotStartExp, slotDateStrForSeasonal)) {
        return NextResponse.json({ error: "This experience is only available during its seasonal window" }, { status: 400 });
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
      addonsById = new Map<string, Addon>();
      addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as Addon));
      slotsRef = db.collection("boats").doc(boatId).collection("slots");
      slotRef = slotsRef.doc(input.slotId);
    }

    const addonsForPricing = buildAddonSelectionsForPricing(input.addonSelections, addonsById);
    let rateForPricing: typeof rate & { priceCents: number } = rate as typeof rate & { priceCents: number };
    if (experienceForPricing && slotStartForPricing && "priceCents" in rate) {
      const effectivePriceCents = getEffectiveRatePriceCents(
        rate as { priceCents: number; priceWeekendCents?: number; priceFriSunCents?: number; priceHolidayCents?: number; durationHours?: number },
        slotStartForPricing,
        experienceForPricing.holidayDates,
        experienceForPricing.weekendDays,
        experienceForPricing.friSunDays
      );
      rateForPricing = { ...rate, priceCents: effectivePriceCents } as typeof rate & { priceCents: number };
    }
    const pricing = computePricing({
      rate: rateForPricing,
      addons: addonsForPricing,
      currency: "usd",
      qty: isSharedTicketed ? input.partySize : 1,
    });
    const tipCents = input.tipCents ?? 0;
    let discountCents = 0;
    let discountCodeApplied: string | undefined;
    if (input.discountCode) {
      const discountSnap = await db.collection("discounts").where("code", "==", input.discountCode).limit(1).get();
      const discountDoc = discountSnap.empty ? null : (discountSnap.docs[0].data() as import("@/lib/booking/types").Discount);
      const result = validateAndApplyDiscount(discountDoc, pricing.totalCents + tipCents);
      if (!result.valid) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      discountCents = result.discountCents;
      discountCodeApplied = result.discount.code;
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
    const now = new Date();
    const expiresAt = new Date(now.getTime() + HOLD_EXPIRY_MINUTES * 60 * 1000);

    const parsedSlotForHold = parseSlotId(input.slotId);
    const holdPayload: Record<string, unknown> = {
      slotId: input.slotId,
      ...(parsedSlotForHold ? { startDateStr: parsedSlotForHold.dateStr } : {}),
      rateId: input.rateId,
      addonSelections: input.addonSelections,
      partySize: input.partySize,
      petsCount: input.petsCount,
      answers: input.answers,
      customerDraft: input.customerDraft,
      marketingOptIn: input.marketingOptIn,
      status: "active",
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: FieldValue.serverTimestamp(),
    };
    if (input.experienceId) holdPayload.experienceId = input.experienceId;
    if (input.boatId) holdPayload.boatId = input.boatId;
    if (experienceForPricing?.pricingType) holdPayload.pricingType = experienceForPricing.pricingType;
    if (input.bookingMode) holdPayload.bookingMode = input.bookingMode;
    if (tipCents > 0) holdPayload.tipCents = tipCents;
    if (discountCodeApplied && discountCents > 0) {
      holdPayload.discountCode = discountCodeApplied;
      holdPayload.discountCents = discountCents;
    }
    holdPayload.pricing = { ...pricing, currency: pricing.currency ?? "usd" };
    holdPayload.effectiveRateCents = rateForPricing.priceCents;

    let reusedHoldId: string | null = null;
    let reusedExpiresAt: Date | null = null;

    if (isSharedTicketed) {
      bookingLog("create-hold", "shared ticketed: reserving capacity and creating hold", { holdId, experienceId: expId, dateStr: parseSlotId(input.slotId)?.dateStr, resumeHoldId: input.resumeHoldId ?? null });
      const parsedForCapacity = parseSlotId(input.slotId);
      if (!parsedForCapacity) {
        return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
      }
      const dateStr = parsedForCapacity.dateStr;
      // isListingBoatFlow uses experience.maxCapacity when set; isExperienceOnly uses capacityMax directly.
      const sharedCapacityLimit = isListingBoatFlow
        ? ((experienceForPricing as Experience).maxCapacity ?? capacityMax)
        : capacityMax;
      // Slug variants cover legacy bookings stored under alternate experienceId values (e.g. "pontoon" slug).
      const expSlug = experienceForPricing && typeof (experienceForPricing as Experience).slug === "string"
        ? ((experienceForPricing as Experience).slug as string).trim()
        : "";
      const slugVariantsList = getExperienceIdVariants(expId, expSlug);
      const inventoryRef = getDepartureInventoryRef(db, expId, dateStr);
      let effectiveHoldId = holdId;
      let effectiveExpiresAt = expiresAt;
      await db.runTransaction(async (tx) => {
        // Single per-departure inventory doc is read and updated so concurrent requests conflict and retry safely.
        const bookingQueries: Promise<import("firebase-admin").firestore.QuerySnapshot>[] = [
          tx.get(db.collection("bookings").where("experienceId", "==", expId).where("startDateStr", "==", dateStr)),
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

        // Honor resumeHoldId: reuse existing hold when valid to avoid reserving fresh capacity on retries.
        if (input.resumeHoldId && input.resumeHoldId.trim()) {
          const existingHoldSnap = await tx.get(db.collection("holds").doc(input.resumeHoldId.trim()));
          if (existingHoldSnap.exists) {
            const existingHold = existingHoldSnap.data() as Hold & { expiresAt?: { toDate?: () => Date; seconds?: number } };
            const exp = existingHold.expiresAt;
            const expiryDate = exp?.toDate?.() ?? (typeof exp?.seconds === "number" ? new Date(exp.seconds * 1000) : new Date(0));
            const isActive = existingHold.status === "active" && expiryDate > now;
            const sameExperience = existingHold.experienceId === expId || slugVariantsList.includes(existingHold.experienceId ?? "");
            const sameSlot = existingHold.slotId === input.slotId;
            const sameMode = existingHold.bookingMode === "shared";
            if (isActive && sameExperience && sameSlot && sameMode) {
              const oldPartySize = typeof existingHold.partySize === "number" ? existingHold.partySize : 0;
              const delta = input.partySize - oldPartySize;
              const holdUpdatePayload = {
                addonSelections: input.addonSelections,
                partySize: input.partySize,
                petsCount: input.petsCount,
                answers: input.answers,
                customerDraft: input.customerDraft,
                marketingOptIn: input.marketingOptIn,
                expiresAt: Timestamp.fromDate(expiresAt),
                tipCents: tipCents,
                ...(holdPayload.pricing ? { pricing: holdPayload.pricing } : {}),
                ...(holdPayload.effectiveRateCents != null ? { effectiveRateCents: holdPayload.effectiveRateCents } : {}),
                ...(discountCodeApplied && discountCents > 0 ? { discountCode: discountCodeApplied, discountCents } : {}),
                depositPaymentIntentId: FieldValue.delete(),
                fullPaymentIntentId: FieldValue.delete(),
              };
              if (delta === 0) {
                // No capacity change: just refresh hold (expiry, pricing, etc.).
                tx.update(db.collection("holds").doc(input.resumeHoldId.trim()), holdUpdatePayload);
              } else if (delta < 0) {
                // Decrease: release seats by |delta|, then update hold.
                await releaseCapacity(tx, inventoryRef, -delta);
                tx.update(db.collection("holds").doc(input.resumeHoldId.trim()), holdUpdatePayload);
              } else {
                // Increase: release old seats then reserve new total (capacity check for increase).
                await releaseCapacity(tx, inventoryRef, oldPartySize);
                await reserveCapacity(tx, inventoryRef, sharedCapacityLimit, input.partySize, sold);
                tx.update(db.collection("holds").doc(input.resumeHoldId.trim()), holdUpdatePayload);
              }
              effectiveHoldId = input.resumeHoldId.trim();
              effectiveExpiresAt = expiresAt;
              return;
            }
          }
        }

        // No valid reusable hold: create new hold and reserve full party size.
        await reserveCapacity(tx, inventoryRef, sharedCapacityLimit, input.partySize, sold);
        tx.set(db.collection("holds").doc(holdId), holdPayload);
      });
      const responsePricing = { ...pricing, totalCents: totalCentsWithTip };
      const releaseToken = signReleaseToken(effectiveHoldId, Math.floor(effectiveExpiresAt.getTime() / 1000));
      const response: CreateHoldResponse = {
        holdId: effectiveHoldId,
        expiresAt: effectiveExpiresAt.toISOString(),
        pricing: responsePricing,
        ...(releaseToken ? { releaseToken } : {}),
      };
      bookingLog("create-hold", "shared ticketed hold created", { holdId: effectiveHoldId, expiresAt: effectiveExpiresAt.toISOString(), reused: effectiveHoldId !== holdId });
      return NextResponse.json(response);
    }

    bookingLog("create-hold", "charter/legacy: starting transaction (slot hold + hold doc)");
    await db.runTransaction(async (tx) => {
      const assertNotBlocked = async (slotStart: Date, slotEnd: Date) => {
        if (!input.experienceId) return;
        const blocked = await hasOverlappingBlock({
          db,
          Timestamp,
          experienceId: input.experienceId,
          boatId: input.boatId,
          slotStart,
          slotEnd,
          get: (q) => tx.get(q),
        });
        if (blocked) throw new Error("This slot is blocked");
      };

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
                if (input.resumeHoldId !== slot.holdId) {
                  throw new Error("Slot no longer available");
                }
                const newExpiresAt = new Date(now.getTime() + HOLD_EXPIRY_MINUTES * 60 * 1000);
                reusedHoldId = slot.holdId;
                reusedExpiresAt = newExpiresAt;
                await assertNotBlocked(slotStartDate, slotEndDate);
                // Clear stage-specific payment intent IDs when reusing/extending a hold with mutated pricing
                // so stale intents (wrong amount) cannot be reused.
                // Reused-hold update must match what a new hold would persist: include all mutable checkout fields
                // and explicitly clear discount fields when no discount applies (avoid stale payer/discount state).
                const discountUpdate =
                  discountCodeApplied && discountCents > 0
                    ? { discountCode: discountCodeApplied, discountCents, stripeCouponId: FieldValue.delete() }
                    : {
                        discountCode: FieldValue.delete(),
                        discountCents: FieldValue.delete(),
                        stripeCouponId: FieldValue.delete(),
                      };
                tx.update(db.collection("holds").doc(slot.holdId), {
                  addonSelections: input.addonSelections,
                  partySize: input.partySize,
                  petsCount: input.petsCount,
                  answers: input.answers,
                  customerDraft: input.customerDraft,
                  marketingOptIn: input.marketingOptIn,
                  expiresAt: Timestamp.fromDate(newExpiresAt),
                  tipCents: tipCents,
                  ...(holdPayload.pricing ? { pricing: holdPayload.pricing } : {}),
                  ...(holdPayload.effectiveRateCents != null ? { effectiveRateCents: holdPayload.effectiveRateCents } : {}),
                  ...discountUpdate,
                  depositPaymentIntentId: FieldValue.delete(),
                  fullPaymentIntentId: FieldValue.delete(),
                });
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
        // Defense in depth: ensure no paid booking already exists for this boat/experience and time.
        // Queries are date-bounded via startDateStr; boatId/status are filtered in code on the small result set.
        // Index used: bookings(experienceId, startDateStr).
        const slotStartMs = slotStartDate.getTime();
        const slotEndMs = slotEndDate.getTime();
        const parsedForCheck = parseSlotId(input.slotId);
        if (parsedForCheck && isListingBoatFlow && input.boatId) {
          const paidForBoat = await tx.get(
            db.collection("bookings").where("experienceId", "==", input.experienceId).where("startDateStr", "==", parsedForCheck.dateStr)
          );
          for (const doc of paidForBoat.docs) {
            const b = doc.data() as { slotId?: string; boatId?: string; status?: string; bookingMode?: string };
            if (b.boatId !== input.boatId) continue;
            if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
            if (isCharterTicketed && b.bookingMode === "shared") throw new Error("Shared tickets have already been sold for this departure");
            const p = b.slotId ? parseSlotId(b.slotId) : null;
            if (!p) continue;
            const { start: exStart, end: exEnd } = getSlotStartEnd(p.dateStr, p.startHour, p.durationHours, p.startMinute ?? 0);
            if (slotStartMs < exEnd.getTime() && slotEndMs > exStart.getTime()) {
              throw new Error("Slot no longer available");
            }
          }
        } else if (parsedForCheck && isExperienceOnly && input.experienceId) {
          const paidForExp = await tx.get(
            db.collection("bookings").where("experienceId", "==", input.experienceId).where("startDateStr", "==", parsedForCheck.dateStr)
          );
          for (const doc of paidForExp.docs) {
            const b = doc.data() as { slotId?: string; status?: string; bookingMode?: string };
            if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
            if (isCharterTicketed && b.bookingMode === "shared") throw new Error("Shared tickets have already been sold for this departure");
            const p = b.slotId ? parseSlotId(b.slotId) : null;
            if (!p) continue;
            const { start: exStart, end: exEnd } = getSlotStartEnd(p.dateStr, p.startHour, p.durationHours, p.startMinute ?? 0);
            if (slotStartMs < exEnd.getTime() && slotEndMs > exStart.getTime()) {
              throw new Error("Slot no longer available");
            }
          }
        }
        await assertNotBlocked(slotStartDate, slotEndDate);
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
        const dayStart = new Date(parsed.dateStr + "T00:00:00");
        const dayEnd = new Date(parsed.dateStr + "T23:59:59.999");
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
        // Also reject if a paid booking already exists for this boat/experience and time (slot doc may be missing).
        // Queries are date-bounded via startDateStr; boatId/status are filtered in code on the small result set.
        // Index used: bookings(experienceId, startDateStr).
        if (isListingBoatFlow && input.boatId) {
          const paidForBoat = await tx.get(
            db.collection("bookings").where("experienceId", "==", input.experienceId).where("startDateStr", "==", parsed.dateStr)
          );
          for (const doc of paidForBoat.docs) {
            const b = doc.data() as { slotId?: string; boatId?: string; status?: string; bookingMode?: string };
            if (b.boatId !== input.boatId) continue;
            if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
            if (isCharterTicketed && b.bookingMode === "shared") throw new Error("Shared tickets have already been sold for this departure");
            const p = b.slotId ? parseSlotId(b.slotId) : null;
            if (!p) continue;
            const { start: exStart, end: exEnd } = getSlotStartEnd(p.dateStr, p.startHour, p.durationHours, p.startMinute ?? 0);
            if (slotStartMs < exEnd.getTime() && slotEndMs > exStart.getTime()) {
              throw new Error("Slot no longer available");
            }
          }
        } else if (isExperienceOnly && input.experienceId) {
          const paidForExp = await tx.get(
            db.collection("bookings").where("experienceId", "==", input.experienceId).where("startDateStr", "==", parsed.dateStr)
          );
          for (const doc of paidForExp.docs) {
            const b = doc.data() as { slotId?: string; status?: string; bookingMode?: string };
            if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
            if (isCharterTicketed && b.bookingMode === "shared") throw new Error("Shared tickets have already been sold for this departure");
            const p = b.slotId ? parseSlotId(b.slotId) : null;
            if (!p) continue;
            const { start: exStart, end: exEnd } = getSlotStartEnd(p.dateStr, p.startHour, p.durationHours, p.startMinute ?? 0);
            if (slotStartMs < exEnd.getTime() && slotEndMs > exStart.getTime()) {
              throw new Error("Slot no longer available");
            }
          }
        }
        await assertNotBlocked(slotStartDate, slotEndDate);
        tx.set(slotRef, {
          startAt: Timestamp.fromDate(slotStartDate),
          endAt: Timestamp.fromDate(slotEndDate),
          status: "held",
          holdId,
          bookingId: null,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      tx.set(db.collection("holds").doc(holdId), holdPayload);
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
      };
      return NextResponse.json(response);
    }

    const releaseToken = signReleaseToken(holdId, Math.floor(expiresAt.getTime() / 1000));
    const response: CreateHoldResponse = {
      holdId,
      expiresAt: expiresAt.toISOString(),
      pricing: responsePricing,
      ...(releaseToken ? { releaseToken } : {}),
    };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create hold failed";
    if (
      message === "Slot not found" ||
      message === "Slot no longer available" ||
      message === "This slot is blocked" ||
      message === "This departure is reserved as a private charter" ||
      message === "Shared tickets have already been sold for this departure" ||
      message === "This date is sold out." ||
      message.startsWith("Only ")
    ) {
      bookingLog("create-hold", "conflict (409)", { message });
      return NextResponse.json({ error: message }, { status: 409 });
    }
    bookingError("create-hold", "create hold failed", err, { message });
    const isConfig = /Firebase config missing|FIREBASE_PRIVATE_KEY|Missing required env/i.test(message);
    return NextResponse.json(
      {
        error: isConfig ? "Booking is not configured." : message || "Create hold failed",
        hint: isConfig
          ? "Set Firebase and Stripe env vars in your deployment (see docs/BOOKING_SETUP.md)."
          : undefined,
      },
      { status: isConfig ? 503 : 500 }
    );
  }
}
