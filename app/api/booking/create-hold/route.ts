import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { buildAddonSelectionsForPricing, computePricing, getEffectiveRatePriceCents } from "@/lib/booking/pricing";
import { validateAndApplyDiscount } from "@/lib/booking/discount";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";
import type { CreateHoldInput, CreateHoldResponse } from "@/lib/booking/types";
import type { Boat, Rate, Addon, Slot, Hold } from "@/lib/booking/types";
import type { Experience, ExperienceRate, ExperienceAddon, ListingBoat, BoatRate } from "@/lib/booking/types";

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
  if (petsCount == null) missing.push("petsCount (number)");
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
  return {
    input: {
      boatId: boatId ?? undefined,
      experienceId: experienceId ?? undefined,
      slotId: slotId!,
      rateId: rateId!,
      addonSelections,
      partySize: partySize!,
      petsCount: petsCount!,
      answers,
      customerDraft: {
        name: (customerDraft!.name as string).trim(),
        email: (customerDraft!.email as string).trim(),
        phone: (customerDraft!.phone as string).trim(),
      },
      marketingOptIn,
      tipCents,
      discountCode: discountCode || undefined,
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
    if (hasExperience && !hasBoat) {
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
    const isListingBoatFlow = hasExperience && hasBoat; // experience slots + boat rates
    const isExperienceOnly = hasExperience && !hasBoat;
    const isLegacyBoat = !hasExperience && hasBoat;

    let capacityMax: number;
    let petsMax: number;
    let slotsRef: import("firebase-admin").firestore.CollectionReference;
    let rate: Rate | ExperienceRate | BoatRate;
    let addonsById: Map<string, Addon | ExperienceAddon>;
    let slotRef: import("firebase-admin").firestore.DocumentReference;
    let slotStartForPricing: Date | null = null;
    let experienceForPricing: Experience | null = null;
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
      capacityMax = experience.maxGuests ?? 14;
      petsMax = experience.petsMax ?? 0;
      if (input.partySize > capacityMax) {
        return NextResponse.json({ error: "Party size exceeds capacity" }, { status: 400 });
      }
      if (input.petsCount > petsMax) {
        return NextResponse.json({ error: "Pets exceed maximum" }, { status: 400 });
      }
      const rateDoc = await db.collection("experiences").doc(expId).collection("rates").doc(input.rateId).get();
      if (!rateDoc.exists) {
        return NextResponse.json({ error: "Rate not found" }, { status: 404 });
      }
      rate = rateDoc.data() as ExperienceRate;
      if (!rate.active) {
        return NextResponse.json({ error: "Rate not available" }, { status: 400 });
      }
      slotsRef = db.collection("boats").doc(boatId).collection("slots");
      slotRef = slotsRef.doc(input.slotId);
      const slotDoc = await slotRef.get();
      let slotStart: Date;
      if (slotDoc.exists) {
        const slotData = slotDoc.data() as Slot;
        slotStart = (slotData.startAt as { toDate(): Date }).toDate();
      } else {
        const parsed = parseSlotId(input.slotId);
        if (!parsed) {
          return NextResponse.json({ error: "Invalid slot" }, { status: 400 });
        }
        if (rate.durationHours !== parsed.durationHours) {
          return NextResponse.json({ error: "Slot duration does not match rate" }, { status: 400 });
        }
        slotStart = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours).start;
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
      capacityMax = experience.maxGuests ?? 14;
      petsMax = experience.petsMax ?? 0;
      if (input.partySize > capacityMax) {
        return NextResponse.json({ error: "Party size exceeds capacity" }, { status: 400 });
      }
      if (input.petsCount > petsMax) {
        return NextResponse.json({ error: "Pets exceed maximum" }, { status: 400 });
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
      slotRef = slotsRef.doc(input.slotId);
      const slotDocExp = await slotRef.get();
      let slotStartExp: Date;
      if (slotDocExp.exists) {
        const slotData = slotDocExp.data() as Slot;
        slotStartExp = (slotData.startAt as { toDate(): Date }).toDate();
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
        slotStartExp = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours).start;
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
      petsMax = boat.petsMax;
      if (input.partySize > capacityMax) {
        return NextResponse.json({ error: "Party size exceeds capacity" }, { status: 400 });
      }
      if (input.petsCount > boat.petsMax) {
        return NextResponse.json({ error: "Pets exceed maximum" }, { status: 400 });
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

    const addonsForPricing = buildAddonSelectionsForPricing(input.addonSelections, addonsById);
    let rateForPricing: typeof rate & { priceCents: number } = rate as typeof rate & { priceCents: number };
    if (experienceForPricing && slotStartForPricing && "priceCents" in rate) {
      rateForPricing = { ...rate, priceCents: getEffectiveRatePriceCents(rate as { priceCents: number; priceWeekendCents?: number; priceFriSunCents?: number; priceHolidayCents?: number; durationHours?: number }, slotStartForPricing, experienceForPricing.holidayDates, experienceForPricing.weekendDays, experienceForPricing.friSunDays) } as typeof rate & { priceCents: number };
    }
    const pricing = computePricing({
      rate: rateForPricing,
      addons: addonsForPricing,
      currency: "usd",
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
    if (tipCents > 0) holdPayload.tipCents = tipCents;
    if (discountCodeApplied && discountCents > 0) {
      holdPayload.discountCode = discountCodeApplied;
      holdPayload.discountCents = discountCents;
    }

    let reusedHoldId: string | null = null;
    let reusedExpiresAt: Date | null = null;

    await db.runTransaction(async (tx) => {
      const slotSnap = await tx.get(slotRef);
      if (slotSnap.exists) {
        const slot = slotSnap.data() as Slot;
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
                tx.update(db.collection("holds").doc(slot.holdId), {
                  addonSelections: input.addonSelections,
                  partySize: input.partySize,
                  petsCount: input.petsCount,
                  answers: input.answers,
                  customerDraft: input.customerDraft,
                  marketingOptIn: input.marketingOptIn,
                  expiresAt: Timestamp.fromDate(newExpiresAt),
                  tipCents: tipCents,
                });
                return;
              }
            }
          }
          throw new Error("Slot no longer available");
        }
        // Defense in depth: ensure no paid booking already exists for this boat/experience and time
        const slotStartMs = (slot.startAt as { toDate(): Date }).toDate().getTime();
        const slotEndMs = (slot.endAt as { toDate(): Date }).toDate().getTime();
        const parsedForCheck = parseSlotId(input.slotId);
        if (parsedForCheck && isListingBoatFlow && input.boatId) {
          const paidForBoat = await tx.get(
            db.collection("bookings").where("experienceId", "==", input.experienceId).where("boatId", "==", input.boatId).where("status", "==", "paid")
          );
          for (const doc of paidForBoat.docs) {
            const b = doc.data() as { slotId?: string };
            const p = b.slotId ? parseSlotId(b.slotId) : null;
            if (!p || p.dateStr !== parsedForCheck.dateStr) continue;
            const { start: exStart, end: exEnd } = getSlotStartEnd(p.dateStr, p.startHour, p.durationHours);
            if (slotStartMs < exEnd.getTime() && slotEndMs > exStart.getTime()) {
              throw new Error("Slot no longer available");
            }
          }
        } else if (parsedForCheck && isExperienceOnly && input.experienceId) {
          const paidForExp = await tx.get(
            db.collection("bookings").where("experienceId", "==", input.experienceId).where("status", "==", "paid")
          );
          for (const doc of paidForExp.docs) {
            const b = doc.data() as { slotId?: string };
            const p = b.slotId ? parseSlotId(b.slotId) : null;
            if (!p || p.dateStr !== parsedForCheck.dateStr) continue;
            const { start: exStart, end: exEnd } = getSlotStartEnd(p.dateStr, p.startHour, p.durationHours);
            if (slotStartMs < exEnd.getTime() && slotEndMs > exStart.getTime()) {
              throw new Error("Slot no longer available");
            }
          }
        }
        tx.update(slotRef, {
          status: "held",
          holdId,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        if (!isExperienceOnly && !isListingBoatFlow) throw new Error("Slot not found");
        const parsed = parseSlotId(input.slotId);
        if (!parsed) throw new Error("Invalid slot");
        const { start: slotStartDate, end: slotEndDate } = getSlotStartEnd(
          parsed.dateStr,
          parsed.startHour,
          parsed.durationHours
        );
        const slotStartMs = slotStartDate.getTime();
        const slotEndMs = slotEndDate.getTime();
        // Prevent double-booking: reject if any existing held/booked/blocked slot overlaps this time
        const dayStart = new Date(parsed.dateStr + "T00:00:00");
        const dayEnd = new Date(parsed.dateStr + "T23:59:59.999");
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
            db.collection("bookings").where("experienceId", "==", input.experienceId).where("boatId", "==", input.boatId).where("status", "==", "paid")
          );
          for (const doc of paidForBoat.docs) {
            const b = doc.data() as { slotId?: string };
            const p = b.slotId ? parseSlotId(b.slotId) : null;
            if (!p || p.dateStr !== parsed.dateStr) continue;
            const { start: exStart, end: exEnd } = getSlotStartEnd(p.dateStr, p.startHour, p.durationHours);
            if (slotStartMs < exEnd.getTime() && slotEndMs > exStart.getTime()) {
              throw new Error("Slot no longer available");
            }
          }
        } else if (isExperienceOnly && input.experienceId) {
          const paidForExp = await tx.get(
            db.collection("bookings").where("experienceId", "==", input.experienceId).where("status", "==", "paid")
          );
          for (const doc of paidForExp.docs) {
            const b = doc.data() as { slotId?: string };
            const p = b.slotId ? parseSlotId(b.slotId) : null;
            if (!p || p.dateStr !== parsed.dateStr) continue;
            const { start: exStart, end: exEnd } = getSlotStartEnd(p.dateStr, p.startHour, p.durationHours);
            if (slotStartMs < exEnd.getTime() && slotEndMs > exStart.getTime()) {
              throw new Error("Slot no longer available");
            }
          }
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
    if (message === "Slot not found" || message === "Slot no longer available") {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("[create-hold]", err);
    return NextResponse.json({ error: "Create hold failed" }, { status: 500 });
  }
}
