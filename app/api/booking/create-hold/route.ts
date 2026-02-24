import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { buildAddonSelectionsForPricing, computePricing, getEffectiveRatePriceCents } from "@/lib/booking/pricing";
import { validateAndApplyDiscount } from "@/lib/booking/discount";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
import type { CreateHoldInput, CreateHoldResponse } from "@/lib/booking/types";
import type { Boat, Rate, Addon, Slot, Hold } from "@/lib/booking/types";
import type { Experience, ExperienceRate, ExperienceAddon, ListingBoat, BoatRate } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";

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
        email: (customerDraft!.email as string).trim(),
        phone: (customerDraft!.phone as string).trim(),
      },
      marketingOptIn,
      tipCents,
      discountCode: discountCode || undefined,
      bookingMode,
    },
  };
}

function isSeasonalAllowed(exp: Experience, slotStart: Date): boolean {
  if (!exp.seasonal?.enabled) return true;
  const startMonth = exp.seasonal.startMonth ?? 1;
  const endMonth = exp.seasonal.endMonth ?? 12;
  const month = slotStart.getMonth() + 1; // 1-12
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
    const rl = checkRateLimit(getClientKey(request));
    if (!rl.allowed) {
      const retryAfter = rl.retryAfterMs ? Math.ceil(rl.retryAfterMs / 1000) : 60;
      return NextResponse.json(
        { error: "Too many requests. Please try again in a moment." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
    const body = await request.json().catch(() => null);
    const parsed = parseBody(body);
    if (!parsed.input) {
      return NextResponse.json(
        { error: "Invalid request body", hint: parsed.hint },
        { status: 400 }
      );
    }
    const input = parsed.input;
    const db = getDb();
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
      // Experience + listing boat: experience slots, addons, and rates (boat is for availability only)
      const expDoc = await db.collection("experiences").doc(expId).get();
      if (!expDoc.exists) {
        return NextResponse.json({ error: "Experience not found" }, { status: 404 });
      }
      const experience = expDoc.data() as Experience;
      if (!experience.active) {
        return NextResponse.json({ error: "Experience not available" }, { status: 400 });
      }
      const boatId = input.boatId!;
      const boatDoc = await db.collection("boats").doc(boatId).get();
      if (!boatDoc.exists) {
        return NextResponse.json({ error: "Boat not found" }, { status: 404 });
      }
      const boat = boatDoc.data() as ListingBoat & { active?: boolean };
      if (boat.isListingBoat !== true || !Array.isArray(boat.experienceIds) || !boat.experienceIds.includes(expId)) {
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
      const rateDoc = await db.collection("experiences").doc(expId).collection("rates").doc(input.rateId).get();
      if (!rateDoc.exists) {
        return NextResponse.json({ error: "Rate not found" }, { status: 404 });
      }
      rate = rateDoc.data() as ExperienceRate;
      if (!rate.active) {
        return NextResponse.json({ error: "Rate not available" }, { status: 400 });
      }
      if (isSharedTicketed || isCharterTicketed) {
        const parsedSlotForCheck = parseSlotId(input.slotId);
        if (parsedSlotForCheck) {
          const dateStr = parsedSlotForCheck.dateStr;
          const now = Date.now();
          const [booksSnap, holdsSnap] = await Promise.all([
            db.collection("bookings").where("experienceId", "==", expId).get(),
            db.collection("holds").where("experienceId", "==", expId).where("status", "==", "active").get(),
          ]);
          if (isSharedTicketed) {
            let sold = 0;
            for (const doc of booksSnap.docs) {
              const b = doc.data() as { slotId?: string; partySize?: number; status?: string; bookingMode?: string };
              if (!b.slotId || typeof b.partySize !== "number") continue;
              if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
              const p = parseSlotId(b.slotId);
              if (p?.dateStr !== dateStr) continue;
              if (b.bookingMode === "charter") {
                return NextResponse.json({ error: "This departure is reserved as a private charter" }, { status: 409 });
              }
              sold += b.partySize;
            }
            let onHold = 0;
            for (const doc of holdsSnap.docs) {
              const h = doc.data() as { slotId?: string; partySize?: number; expiresAt?: { toDate(): Date } };
              if (!h.slotId || typeof h.partySize !== "number") continue;
              if (h.expiresAt && h.expiresAt.toDate().getTime() < now) continue;
              const p = parseSlotId(h.slotId);
              if (p?.dateStr === dateStr) onHold += h.partySize;
            }
            const capacityForCheck = experience.maxCapacity ?? capacityMax;
            if (sold + onHold + input.partySize > capacityForCheck) {
              const available = Math.max(0, capacityForCheck - sold - onHold);
              return NextResponse.json(
                { error: available === 0 ? "This date is sold out." : `Only ${available} ticket${available === 1 ? "" : "s"} remaining for this date.` },
                { status: 409 }
              );
            }
          } else {
            for (const doc of booksSnap.docs) {
              const b = doc.data() as { slotId?: string; status?: string; bookingMode?: string };
              if (!b.slotId) continue;
              if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
              const p = parseSlotId(b.slotId);
              if (p?.dateStr !== dateStr) continue;
              if (b.bookingMode === "shared") {
                return NextResponse.json({ error: "Shared tickets have already been sold for this departure" }, { status: 409 });
              }
            }
          }
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
      if (!isSeasonalAllowed(experience, slotStart)) {
        return NextResponse.json({ error: "This experience is only available during its seasonal window" }, { status: 400 });
      }
      slotStartForPricing = slotStart;
      experienceForPricing = experience;
      const addonsSnap = await db.collection("experiences").doc(expId).collection("addons").get();
      addonsById = new Map();
      addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as ExperienceAddon));
    } else if (isExperienceOnly) {
      const expDoc = await db.collection("experiences").doc(expId).get();
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
      if (isSharedTicketed || isCharterTicketed) {
        const parsedSlot = parseSlotId(input.slotId);
        if (parsedSlot) {
          const dateStr = parsedSlot.dateStr;
          const now = Date.now();
          const [booksSnap, holdsSnap] = await Promise.all([
            db.collection("bookings").where("experienceId", "==", expId).get(),
            db.collection("holds").where("experienceId", "==", expId).where("status", "==", "active").get(),
          ]);
          if (isSharedTicketed) {
            let sold = 0;
            for (const doc of booksSnap.docs) {
              const b = doc.data() as { slotId?: string; partySize?: number; status?: string; bookingMode?: string };
              if (!b.slotId || typeof b.partySize !== "number") continue;
              if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
              const p = parseSlotId(b.slotId);
              if (p?.dateStr !== dateStr) continue;
              if (b.bookingMode === "charter") {
                return NextResponse.json({ error: "This departure is reserved as a private charter" }, { status: 409 });
              }
              sold += b.partySize;
            }
            let onHold = 0;
            for (const doc of holdsSnap.docs) {
              const h = doc.data() as { slotId?: string; partySize?: number; expiresAt?: { toDate(): Date } };
              if (!h.slotId || typeof h.partySize !== "number") continue;
              if (h.expiresAt && h.expiresAt.toDate().getTime() < now) continue;
              const p = parseSlotId(h.slotId);
              if (p?.dateStr === dateStr) onHold += h.partySize;
            }
            const available = Math.max(0, capacityMax - sold - onHold);
            if (input.partySize > available) {
              return NextResponse.json(
                { error: available === 0 ? "This date is sold out." : `Only ${available} ticket${available === 1 ? "" : "s"} remaining for this date.` },
                { status: 409 }
              );
            }
          } else {
            for (const doc of booksSnap.docs) {
              const b = doc.data() as { slotId?: string; status?: string; bookingMode?: string };
              if (!b.slotId) continue;
              if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
              const p = parseSlotId(b.slotId);
              if (p?.dateStr !== dateStr) continue;
              if (b.bookingMode === "shared") {
                return NextResponse.json({ error: "Shared tickets have already been sold for this departure" }, { status: 409 });
              }
            }
          }
        }
      }
      const rateDoc = await db.collection("experiences").doc(expId).collection("rates").doc(input.rateId).get();
      if (!rateDoc.exists) {
        return NextResponse.json({ error: "Rate not found" }, { status: 404 });
      }
      rate = rateDoc.data() as ExperienceRate;
      if (!rate.active) {
        return NextResponse.json({ error: "Rate not available" }, { status: 400 });
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
          const rateDocExp = await db.collection("experiences").doc(expId).collection("rates").doc(input.rateId).get();
          const rateData = rateDocExp.exists ? (rateDocExp.data() as ExperienceRate) : null;
          if (!rateData || rateData.durationHours !== parsed.durationHours) {
            return NextResponse.json({ error: "Slot duration does not match rate" }, { status: 400 });
          }
          const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
          slotStartExp = start;
          slotStartForBlock = start;
          slotEndForBlock = end;
        }
      }
      if (!isSeasonalAllowed(experience, slotStartExp)) {
        return NextResponse.json({ error: "This experience is only available during its seasonal window" }, { status: 400 });
      }
      slotStartForPricing = slotStartExp;
      experienceForPricing = experience;
      const addonsSnap = await db.collection("experiences").doc(expId).collection("addons").get();
      addonsById = new Map();
      addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as ExperienceAddon));
    } else {
      const boatId = input.boatId!;
      const boatDoc = await db.collection("boats").doc(boatId).get();
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
      const rateDoc = await db.collection("boats").doc(boatId).collection("rates").doc(input.rateId).get();
      if (!rateDoc.exists) {
        return NextResponse.json({ error: "Rate not found" }, { status: 404 });
      }
      rate = rateDoc.data() as Rate;
      if (!rate.active) {
        return NextResponse.json({ error: "Rate not available" }, { status: 400 });
      }
      const addonsSnap = await db.collection("boats").doc(boatId).collection("addons").get();
      addonsById = new Map<string, Addon>();
      addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as Addon));
      slotsRef = db.collection("boats").doc(boatId).collection("slots");
      slotRef = slotsRef.doc(input.slotId);
    }

    if (input.experienceId && slotStartForBlock && slotEndForBlock) {
      const blocked = await hasOverlappingBlock({
        db,
        Timestamp,
        experienceId: input.experienceId,
        boatId: input.boatId,
        slotStart: slotStartForBlock,
        slotEnd: slotEndForBlock,
      });
      if (blocked) {
        return NextResponse.json({ error: "This slot is blocked" }, { status: 409 });
      }
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
    const holdId = db.collection("holds").doc().id;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + HOLD_EXPIRY_MINUTES * 60 * 1000);

    const holdPayload: Record<string, unknown> = {
      slotId: input.slotId,
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
      const parsedForCapacity = parseSlotId(input.slotId);
      if (!parsedForCapacity) {
        return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
      }
      const dateStr = parsedForCapacity.dateStr;
      // isListingBoatFlow uses experience.maxCapacity when set; isExperienceOnly uses capacityMax directly.
      const sharedCapacityLimit = isListingBoatFlow
        ? ((experienceForPricing as Experience).maxCapacity ?? capacityMax)
        : capacityMax;
      await db.runTransaction(async (tx) => {
        const nowMs = Date.now();
        const [booksSnap, holdsSnap] = await Promise.all([
          tx.get(db.collection("bookings").where("experienceId", "==", expId)),
          tx.get(
            db.collection("holds")
              .where("experienceId", "==", expId)
              .where("status", "==", "active")
          ),
        ]);
        let sold = 0;
        for (const doc of booksSnap.docs) {
          const b = doc.data() as { slotId?: string; partySize?: number; status?: string; bookingMode?: string };
          if (!b.slotId || typeof b.partySize !== "number") continue;
          if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
          const p = parseSlotId(b.slotId);
          if (p?.dateStr !== dateStr) continue;
          if (b.bookingMode === "charter") throw new Error("This departure is reserved as a private charter");
          sold += b.partySize;
        }
        let onHold = 0;
        for (const doc of holdsSnap.docs) {
          const h = doc.data() as { slotId?: string; partySize?: number; expiresAt?: { toDate(): Date } };
          if (!h.slotId || typeof h.partySize !== "number") continue;
          if (h.expiresAt && h.expiresAt.toDate().getTime() < nowMs) continue;
          const p = parseSlotId(h.slotId);
          if (p?.dateStr === dateStr) onHold += h.partySize;
        }
        if (sold + onHold + input.partySize > sharedCapacityLimit) {
          const available = Math.max(0, sharedCapacityLimit - sold - onHold);
          throw new Error(
            available === 0
              ? "This date is sold out."
              : `Only ${available} ticket${available === 1 ? "" : "s"} remaining for this date.`
          );
        }
        tx.set(db.collection("holds").doc(holdId), holdPayload);
      });
      const responsePricing = { ...pricing, totalCents: totalCentsWithTip };
      const response: CreateHoldResponse = { holdId, expiresAt: expiresAt.toISOString(), pricing: responsePricing };
      return NextResponse.json(response);
    }

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
              const sameSlot =
                existingHold.slotId === input.slotId &&
                (existingHold.experienceId ?? undefined) === (input.experienceId ?? undefined) &&
                (existingHold.boatId ?? undefined) === (input.boatId ?? undefined) &&
                existingHold.rateId === input.rateId;
              if (
                existingHold.status === "active" &&
                expiryDate > now &&
                sameSlot
              ) {
                const newExpiresAt = new Date(now.getTime() + HOLD_EXPIRY_MINUTES * 60 * 1000);
                reusedHoldId = slot.holdId;
                reusedExpiresAt = newExpiresAt;
                await assertNotBlocked(slotStartDate, slotEndDate);
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
                  ...(discountCodeApplied && discountCents > 0 ? { discountCode: discountCodeApplied, discountCents } : {}),
                });
                return;
              }
              // Hold exists but expired or different slot → treat slot as available, overwrite with new hold below
              if (expiryDate <= now || existingHold.status !== "active") {
                // fall through to update slot and create new hold
              } else {
                throw new Error("Slot no longer available");
              }
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
        // Defense in depth: ensure no paid booking already exists for this boat/experience and time
        const slotStartMs = slotStartDate.getTime();
        const slotEndMs = slotEndDate.getTime();
        const parsedForCheck = parseSlotId(input.slotId);
        if (parsedForCheck && isListingBoatFlow && input.boatId) {
          const paidForBoat = await tx.get(
            db.collection("bookings").where("experienceId", "==", input.experienceId).where("boatId", "==", input.boatId).where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
          );
          for (const doc of paidForBoat.docs) {
            const b = doc.data() as { slotId?: string };
            const p = b.slotId ? parseSlotId(b.slotId) : null;
            if (!p || p.dateStr !== parsedForCheck.dateStr) continue;
            const { start: exStart, end: exEnd } = getSlotStartEnd(p.dateStr, p.startHour, p.durationHours, p.startMinute ?? 0);
            if (slotStartMs < exEnd.getTime() && slotEndMs > exStart.getTime()) {
              throw new Error("Slot no longer available");
            }
          }
        } else if (parsedForCheck && isExperienceOnly && input.experienceId) {
          const paidForExp = await tx.get(
            db.collection("bookings").where("experienceId", "==", input.experienceId).where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
          );
          for (const doc of paidForExp.docs) {
            const b = doc.data() as { slotId?: string };
            const p = b.slotId ? parseSlotId(b.slotId) : null;
            if (!p || p.dateStr !== parsedForCheck.dateStr) continue;
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
        const isHeldTrulyTaken = async (slotData: Slot, holdId: string | null | undefined): Promise<boolean> => {
          if (slotData.status !== "held" || !holdId) return slotData.status !== "open";
          const holdSnap = await tx.get(db.collection("holds").doc(holdId));
          if (!holdSnap.exists) return false; // missing hold → treat as open
          const hold = holdSnap.data() as { status?: string; expiresAt?: { toDate(): Date } };
          if (hold?.status !== "active") return false;
          const exp = hold?.expiresAt?.toDate?.();
          if (exp && exp <= now) return false; // expired → treat as open
          return true;
        };
        const isBookedTrulyTaken = async (slotData: Slot): Promise<boolean> => {
          if (slotData.status !== "booked" || !slotData.bookingId) return false;
          const bookingSnap = await tx.get(db.collection("bookings").doc(slotData.bookingId));
          if (!bookingSnap.exists) return false;
          const b = bookingSnap.data() as { status?: string };
          return !!(b.status && BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never));
        };

        if (isListingBoatFlow && input.boatId) {
          const boatSlotsRef = db.collection("boats").doc(input.boatId).collection("slots");
          const sameDaySnap = await tx.get(
            boatSlotsRef
              .where("startAt", ">=", Timestamp.fromDate(dayStart))
              .where("startAt", "<=", Timestamp.fromDate(dayEnd))
          );
          for (const doc of sameDaySnap.docs) {
            const data = doc.data() as Slot;
            if (data.status === "open") continue;
            if (data.status === "held" && !(await isHeldTrulyTaken(data, data.holdId))) continue;
            if (data.status === "booked" && !(await isBookedTrulyTaken(data))) continue;
            const existingStart = (data.startAt as { toDate(): Date }).toDate().getTime();
            const existingEnd = (data.endAt as { toDate(): Date }).toDate().getTime();
            if (slotStartMs < existingEnd && slotEndMs > existingStart) {
              throw new Error("Slot no longer available");
            }
          }
        } else if (isExperienceOnly && input.experienceId) {
          const expSlotsRef = db.collection("experiences").doc(input.experienceId).collection("slots");
          const sameDaySnap = await tx.get(
            expSlotsRef
              .where("startAt", ">=", Timestamp.fromDate(dayStart))
              .where("startAt", "<=", Timestamp.fromDate(dayEnd))
          );
          for (const doc of sameDaySnap.docs) {
            const data = doc.data() as Slot;
            if (data.status === "open") continue;
            if (data.status === "held" && !(await isHeldTrulyTaken(data, data.holdId))) continue;
            if (data.status === "booked" && !(await isBookedTrulyTaken(data))) continue;
            const existingStart = (data.startAt as { toDate(): Date }).toDate().getTime();
            const existingEnd = (data.endAt as { toDate(): Date }).toDate().getTime();
            if (slotStartMs < existingEnd && slotEndMs > existingStart) {
              throw new Error("Slot no longer available");
            }
          }
        }
        // Also reject if a paid booking already exists for this boat/experience and time (slot doc may be missing)
        if (isListingBoatFlow && input.boatId) {
          const paidForBoat = await tx.get(
            db.collection("bookings").where("experienceId", "==", input.experienceId).where("boatId", "==", input.boatId).where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
          );
          for (const doc of paidForBoat.docs) {
            const b = doc.data() as { slotId?: string };
            const p = b.slotId ? parseSlotId(b.slotId) : null;
            if (!p || p.dateStr !== parsed.dateStr) continue;
            const { start: exStart, end: exEnd } = getSlotStartEnd(p.dateStr, p.startHour, p.durationHours, p.startMinute ?? 0);
            if (slotStartMs < exEnd.getTime() && slotEndMs > exStart.getTime()) {
              throw new Error("Slot no longer available");
            }
          }
        } else if (isExperienceOnly && input.experienceId) {
          const paidForExp = await tx.get(
            db.collection("bookings").where("experienceId", "==", input.experienceId).where("status", "in", Array.from(BOOKING_STATUSES_SLOT_TAKEN))
          );
          for (const doc of paidForExp.docs) {
            const b = doc.data() as { slotId?: string };
            const p = b.slotId ? parseSlotId(b.slotId) : null;
            if (!p || p.dateStr !== parsed.dateStr) continue;
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

    const responsePricing = {
      ...pricing,
      totalCents: totalCentsWithTip,
    };
    if (reusedHoldId != null && reusedExpiresAt != null) {
      const response: CreateHoldResponse = {
        holdId: reusedHoldId,
        expiresAt: (reusedExpiresAt as Date).toISOString(),
        pricing: responsePricing,
      };
      return NextResponse.json(response);
    }

    const response: CreateHoldResponse = {
      holdId,
      expiresAt: expiresAt.toISOString(),
      pricing: responsePricing,
    };
    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create hold failed";
    if (
      message === "Slot not found" ||
      message === "Slot no longer available" ||
      message === "This slot is blocked" ||
      message === "This departure is reserved as a private charter" ||
      message === "This date is sold out." ||
      message.startsWith("Only ")
    ) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("[create-hold]", err);
    return NextResponse.json({ error: "Create hold failed" }, { status: 500 });
  }
}
