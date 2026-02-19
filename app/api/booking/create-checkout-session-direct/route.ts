import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { getStripe, buildLineItems } from "@/lib/booking/stripe-client";
import { buildAddonSelectionsForPricing, computePricing, getEffectiveRatePriceCents } from "@/lib/booking/pricing";
import { validateAndApplyDiscount } from "@/lib/booking/discount";
import { bookingEnv } from "@/lib/booking/env";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";
import type { Experience, ExperienceRate, ExperienceAddon, Slot } from "@/lib/booking/types";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";

const HOLD_EXPIRY_MINUTES = 10;

/** Placeholder customer for direct checkout; Stripe collects real details. */
const PLACEHOLDER_CUSTOMER = {
  name: "Checkout",
  email: "checkout@pending.local",
  phone: "+15555555555",
};

function parseBody(body: unknown): { experienceId: string; slotId: string; boatId?: string; partySize: number; petsCount: number; discountCode?: string } | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const experienceId = typeof o.experienceId === "string" ? o.experienceId : null;
  const slotId = typeof o.slotId === "string" ? o.slotId : null;
  if (!experienceId || !slotId) return null;
  const boatId = typeof o.boatId === "string" ? o.boatId : undefined;
  const partySize = typeof o.partySize === "number" ? o.partySize : 1;
  const petsCount = typeof o.petsCount === "number" ? o.petsCount : 0;
  const discountCode = typeof o.discountCode === "string" ? o.discountCode.trim().toUpperCase() : undefined;
  return { experienceId, slotId, boatId, partySize, petsCount, discountCode: discountCode || undefined };
}

function isSeasonalAllowed(exp: Experience, slotStart: Date): boolean {
  if (!exp.seasonal?.enabled) return true;
  const startMonth = exp.seasonal.startMonth ?? 1;
  const endMonth = exp.seasonal.endMonth ?? 12;
  const month = slotStart.getMonth() + 1;
  if (startMonth <= endMonth) return month >= startMonth && month <= endMonth;
  return month >= startMonth || month <= endMonth;
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
    const body = await request.json();
    const input = parseBody(body);
    if (!input) {
      return NextResponse.json({ error: "experienceId and slotId required" }, { status: 400 });
    }

    const parsed = parseSlotId(input.slotId);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid slotId" }, { status: 400 });
    }

    const db = getDb();
    const { FieldValue, Timestamp } = getFirestoreExports();

    const expDoc = await db.collection("experiences").doc(input.experienceId).get();
    if (!expDoc.exists) {
      return NextResponse.json({ error: "Experience not found" }, { status: 404 });
    }
    const experience = expDoc.data() as Experience;
    if (!experience.active) {
      return NextResponse.json({ error: "Experience not available" }, { status: 400 });
    }
    const maxGuests = getMaxGuestsForExperience(experience);
    if (input.partySize > maxGuests) {
      return NextResponse.json({ error: "Party size exceeds maximum" }, { status: 400 });
    }
    if (input.petsCount > experience.petsMax) {
      return NextResponse.json({ error: "Pets exceed maximum" }, { status: 400 });
    }

    const ratesSnap = await db
      .collection("experiences")
      .doc(input.experienceId)
      .collection("rates")
      .where("active", "==", true)
      .get();
    const rateDoc = ratesSnap.docs.find((d) => (d.data() as ExperienceRate).durationHours === parsed.durationHours);
    if (!rateDoc) {
      return NextResponse.json({ error: "No rate found for this slot duration" }, { status: 404 });
    }
    const rateId = rateDoc.id;
    const rate = rateDoc.data() as ExperienceRate;

    // Experiences with listing boats: slots live under boats/{boatId}/slots. Require boatId so we hold the correct slot.
    const boatsSnap = await db
      .collection("boats")
      .where("isListingBoat", "==", true)
      .where("active", "==", true)
      .where("experienceIds", "array-contains", input.experienceId)
      .get();
    const listingBoatIds = boatsSnap.docs.map((d) => d.id);
    const hasListingBoats = listingBoatIds.length > 0;
    const useBoatSlots = hasListingBoats && !!input.boatId;

    if (hasListingBoats && !input.boatId) {
      return NextResponse.json(
        { error: "This experience requires choosing a boat. Please book from the modal or include boatId." },
        { status: 400 }
      );
    }
    if (input.boatId && !listingBoatIds.includes(input.boatId)) {
      return NextResponse.json({ error: "Boat not found or not available for this experience" }, { status: 404 });
    }

    const slotRef = useBoatSlots
      ? db.collection("boats").doc(input.boatId!).collection("slots").doc(input.slotId)
      : db.collection("experiences").doc(input.experienceId).collection("slots").doc(input.slotId);
    const slotDoc = await slotRef.get();
    let slotStart: Date;
    if (slotDoc.exists) {
      const slotData = slotDoc.data() as Slot;
      slotStart = (slotData.startAt as { toDate(): Date }).toDate();
      if (slotData.status !== "open") {
        return NextResponse.json({ error: "Slot no longer available" }, { status: 409 });
      }
    } else {
      slotStart = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0).start;
    }
    if (!isSeasonalAllowed(experience, slotStart)) {
      return NextResponse.json({ error: "Experience not available for this date" }, { status: 400 });
    }

    const addonsSnap = await db
      .collection("experiences")
      .doc(input.experienceId)
      .collection("addons")
      .get();
    const addonsById = new Map<string, ExperienceAddon>();
    addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as ExperienceAddon));
    const addonsForPricing = buildAddonSelectionsForPricing([], addonsById);
    const rateForPricing = { ...rate, priceCents: getEffectiveRatePriceCents(rate, slotStart, experience.holidayDates, experience.weekendDays, experience.friSunDays) };
    const pricing = computePricing({ rate: rateForPricing, addons: addonsForPricing, currency: "usd" });

    let discountCents = 0;
    let discountCodeApplied: string | undefined;
    if (input.discountCode) {
      const discountSnap = await db.collection("discounts").where("code", "==", input.discountCode).limit(1).get();
      const discountDoc = discountSnap.empty ? null : (discountSnap.docs[0].data() as import("@/lib/booking/types").Discount);
      const result = validateAndApplyDiscount(discountDoc, pricing.totalCents);
      if (!result.valid) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      discountCents = result.discountCents;
      discountCodeApplied = result.discount.code;
    }

    const holdId = db.collection("holds").doc().id;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + HOLD_EXPIRY_MINUTES * 60 * 1000);
    const holdPayload: Record<string, unknown> = {
      experienceId: input.experienceId,
      slotId: input.slotId,
      rateId,
      addonSelections: [] as { addonId: string; qty: number }[],
      partySize: input.partySize,
      petsCount: input.petsCount,
      answers: {} as Record<string, string>,
      customerDraft: PLACEHOLDER_CUSTOMER,
      marketingOptIn: false,
      status: "active",
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: FieldValue.serverTimestamp(),
    };
    if (input.boatId) holdPayload.boatId = input.boatId;
    if (discountCodeApplied && discountCents > 0) {
      holdPayload.discountCode = discountCodeApplied;
      holdPayload.discountCents = discountCents;
    }
    holdPayload.pricing = { ...pricing, currency: pricing.currency ?? "usd" };
    holdPayload.effectiveRateCents = rateForPricing.priceCents;

    await db.runTransaction(async (tx) => {
      const slotSnap = await tx.get(slotRef);
      if (slotSnap.exists) {
        const slot = slotSnap.data() as Slot;
        if (slot.status !== "open") throw new Error("Slot no longer available");
        // Defense in depth: ensure no paid booking already exists for this boat/experience and time
        const slotStartMs = (slot.startAt as { toDate(): Date }).toDate().getTime();
        const slotEndMs = (slot.endAt as { toDate(): Date }).toDate().getTime();
        if (useBoatSlots && input.boatId) {
          const paidForBoat = await tx.get(
            db.collection("bookings").where("experienceId", "==", input.experienceId).where("boatId", "==", input.boatId).where("status", "in", [...BOOKING_STATUSES_SLOT_TAKEN])
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
        } else {
          const paidForExp = await tx.get(
            db.collection("bookings").where("experienceId", "==", input.experienceId).where("status", "in", [...BOOKING_STATUSES_SLOT_TAKEN])
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
        tx.update(slotRef, {
          status: "held",
          holdId,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        const { start: slotStartDate, end: slotEndDate } = getSlotStartEnd(
          parsed.dateStr,
          parsed.startHour,
          parsed.durationHours,
          parsed.startMinute ?? 0
        );
        const slotStartMs = slotStartDate.getTime();
        const slotEndMs = slotEndDate.getTime();
        const dayStart = new Date(parsed.dateStr + "T00:00:00");
        const dayEnd = new Date(parsed.dateStr + "T23:59:59.999");
        if (useBoatSlots && input.boatId) {
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
        } else {
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
        // Reject if a paid booking already exists for this boat/experience and time
        if (useBoatSlots && input.boatId) {
          const paidForBoat = await tx.get(
            db.collection("bookings").where("experienceId", "==", input.experienceId).where("boatId", "==", input.boatId).where("status", "in", [...BOOKING_STATUSES_SLOT_TAKEN])
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
        } else if (!useBoatSlots) {
          const paidForExp = await tx.get(
            db.collection("bookings").where("experienceId", "==", input.experienceId).where("status", "in", [...BOOKING_STATUSES_SLOT_TAKEN])
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

    const hold = { ...holdPayload, expiresAt: holdPayload.expiresAt };
    const lineItems = buildLineItems({
      pricing,
      rate: rateForPricing,
      addons: addonsForPricing,
      hold: hold as unknown as import("@/lib/booking/types").Hold,
    });
    if (discountCents > 0 && discountCodeApplied) {
      lineItems.push({
        price_data: {
          currency: pricing.currency,
          unit_amount: -discountCents,
          product_data: { name: `Discount (${discountCodeApplied})` },
        },
        quantity: 1,
      });
    }
    const baseUrl = bookingEnv.appBaseUrl;
    const stripe = getStripe();
    const metadata: Record<string, string> = {
      holdId,
      slotId: input.slotId,
      rateId,
      experienceId: input.experienceId,
    };
    if (input.boatId) metadata.boatId = input.boatId;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      customer_email: undefined,
      phone_number_collection: { enabled: true },
      custom_fields: [
        { key: "special_notes", label: { type: "custom", custom: "Special requests (optional)" }, type: "text" },
      ],
      metadata,
      success_url: `${baseUrl}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/booking/cancel?holdId=${holdId}`,
    });

    if (session.url) {
      await db.collection("holds").doc(holdId).update({ checkoutSessionId: session.id });
      return NextResponse.json({ url: session.url, sessionId: session.id });
    }
    return NextResponse.json({ error: "Checkout session failed" }, { status: 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Direct checkout failed";
    if (message === "Slot no longer available") {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("[create-checkout-session-direct]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
