import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getSlotStartEnd, parseSlotId, isAllowedSlotTime, isSeasonalAllowed } from "@/lib/booking/experience-slots";
import { getDepartureInventoryRef, releaseCapacity } from "@/lib/booking/shared-departure-inventory";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { assertSlotAvailable, SlotConflictError } from "@/lib/booking/slot-availability";
import { getStripe, buildLineItems } from "@/lib/booking/stripe-client";
import { buildAddonSelectionsForPricing, computePricing, getEffectiveRatePriceCents } from "@/lib/booking/pricing";
import { validateAndApplyDiscount } from "@/lib/booking/discount";
import { bookingEnv } from "@/lib/booking/env";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";
import { generateIncidentCode } from "@/lib/booking/debug";
import { signReleaseToken } from "@/lib/booking/releaseToken";
import type { Experience, ExperienceRate, ExperienceAddon, Slot, ListingBoat } from "@/lib/booking/types";
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
  const partySizeRaw = o.partySize;
  const petsCountRaw = o.petsCount;
  const partySize = typeof partySizeRaw === "number" && Number.isInteger(partySizeRaw) && partySizeRaw >= 1 ? partySizeRaw : null;
  const petsCount = typeof petsCountRaw === "number" && Number.isInteger(petsCountRaw) && petsCountRaw >= 0 ? petsCountRaw : null;
  if (partySize === null || petsCount === null) return null;
  const discountCode = typeof o.discountCode === "string" ? o.discountCode.trim().toUpperCase() : undefined;
  return { experienceId, slotId, boatId, partySize, petsCount, discountCode: discountCode || undefined };
}

export async function POST(request: NextRequest) {
  try {
    const rl = await checkRateLimit(getClientKey(request));
    if (!rl.allowed) {
      if (rl.serverError) {
        const incidentCode = generateIncidentCode();
        console.warn("[create-checkout-session-direct] rate limit service unavailable (503)", { incidentCode });
        return NextResponse.json(
          { error: "Service temporarily unavailable. Please try again shortly.", incidentCode },
          { status: 503 }
        );
      }
      const retryAfter = rl.retryAfterMs ? Math.ceil(rl.retryAfterMs / 1000) : 60;
      return NextResponse.json(
        { error: "Too many requests. Please try again in a moment." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
    const body = await request.json();
    const input = parseBody(body);
    if (!input) {
      const o = body != null && typeof body === "object" ? (body as Record<string, unknown>) : {};
      const hasIds = typeof o.experienceId === "string" && typeof o.slotId === "string";
      if (hasIds) {
        const partyOk = typeof o.partySize === "number" && Number.isInteger(o.partySize) && (o.partySize as number) >= 1;
        const petsOk = typeof o.petsCount === "number" && Number.isInteger(o.petsCount) && (o.petsCount as number) >= 0;
        if (!partyOk) {
          return NextResponse.json({ error: "partySize must be an integer at least 1" }, { status: 400 });
        }
        if (!petsOk) {
          return NextResponse.json({ error: "petsCount must be a non-negative integer" }, { status: 400 });
        }
      }
      return NextResponse.json({ error: "experienceId and slotId required" }, { status: 400 });
    }

    const parsed = parseSlotId(input.slotId);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid slotId" }, { status: 400 });
    }

    const db = getDb();
    const { FieldValue, Timestamp } = getFirestoreExports();

    // Fetch experience, rates, boats, and addons in parallel — all only need experienceId
    const [expDoc, ratesSnap, boatsSnap, addonsSnap] = await Promise.all([
      db.collection("experiences").doc(input.experienceId).get(),
      db.collection("experiences").doc(input.experienceId).collection("rates").where("active", "==", true).get(),
      db.collection("boats").where("isListingBoat", "==", true).where("active", "==", true).where("experienceIds", "array-contains", input.experienceId).get(),
      db.collection("experiences").doc(input.experienceId).collection("addons").get(),
    ]);

    if (!expDoc.exists) {
      return NextResponse.json({ error: "Experience not found" }, { status: 404 });
    }
    const experience = expDoc.data() as Experience;
    const experienceIdVariants = getExperienceIdVariants(input.experienceId, experience?.slug ?? "");
    if (!experience.active) {
      return NextResponse.json({ error: "Experience not available" }, { status: 400 });
    }
    const isTicketed = experience.pricingType === "ticketed";
    if (isTicketed) {
      return NextResponse.json(
        { ticketedFlowRequired: true, message: "This experience requires selecting a date and tickets first.", bookingUrl: `/booking?experienceId=${input.experienceId}` },
        { status: 200 }
      );
    }
    const maxGuests = getMaxGuestsForExperience(experience);
    if (input.partySize > maxGuests) {
      return NextResponse.json({ error: "Party size exceeds maximum" }, { status: 400 });
    }

    const rateDoc = ratesSnap.docs.find((d) => (d.data() as ExperienceRate).durationHours === parsed.durationHours);
    if (!rateDoc) {
      return NextResponse.json({ error: "No rate found for this slot duration" }, { status: 404 });
    }
    const rateId = rateDoc.id;
    const rate = rateDoc.data() as ExperienceRate;

    // Experiences with listing boats: slots live under boats/{boatId}/slots. Require boatId so we hold the correct slot.
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

    // Charter: validate allowed start times for the slot (experience-level or selected boat's allowedStartTimes).
    const selectedBoat = input.boatId
      ? (boatsSnap.docs.find((d) => d.id === input.boatId)?.data() as ListingBoat | undefined)
      : undefined;
    if (!isAllowedSlotTime(parsed.startHour, parsed.startMinute, parsed.durationHours, selectedBoat?.allowedStartTimes)) {
      return NextResponse.json({ error: "Slot is outside the allowed booking window" }, { status: 400 });
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
    if (!isSeasonalAllowed(experience.seasonal, slotStart, parsed.dateStr)) {
      return NextResponse.json({ error: "Experience not available for this date" }, { status: 400 });
    }
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
      startDateStr: parsed.dateStr,
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
        if (slot.status !== "open") throw new SlotConflictError("Slot no longer available");
        const slotStartDate = (slot.startAt as { toDate(): Date }).toDate();
        const slotEndDate = (slot.endAt as { toDate(): Date }).toDate();
        await assertSlotAvailable({
          db,
          Timestamp,
          get: (q) => tx.get(q),
          experienceId: input.experienceId,
          experienceIdVariants,
          parsed,
          slotStart: slotStartDate,
          slotEnd: slotEndDate,
          boatId: input.boatId,
          useBoatSlots,
          runSameDaySlotScan: false,
        });
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
        await assertSlotAvailable({
          db,
          Timestamp,
          get: (q) => tx.get(q),
          experienceId: input.experienceId,
          experienceIdVariants,
          parsed,
          slotStart: slotStartDate,
          slotEnd: slotEndDate,
          boatId: input.boatId,
          useBoatSlots,
          runSameDaySlotScan: true,
        });
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
    const baseUrl = bookingEnv.appBaseUrl;
    const stripe = getStripe();
    let stripeCouponId: string | undefined;
    if (discountCents > 0 && discountCodeApplied) {
      const coupon = await stripe.coupons.create(
        {
          amount_off: discountCents,
          currency: pricing.currency,
          name: `Discount (${discountCodeApplied})`,
          duration: "once",
        },
        { idempotencyKey: `coupon-${holdId}` }
      );
      stripeCouponId = coupon.id;
    }
    const metadata: Record<string, string> = {
      holdId,
      slotId: input.slotId,
      rateId,
      experienceId: input.experienceId,
    };
    if (input.boatId) metadata.boatId = input.boatId;
    const releaseToken = signReleaseToken(holdId, Math.floor(expiresAt.getTime() / 1000));
    let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: lineItems,
        ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
        customer_email: undefined,
        phone_number_collection: { enabled: true },
        custom_fields: [
          { key: "special_notes", label: { type: "custom", custom: "Special requests (optional)" }, type: "text" },
        ],
        metadata,
        success_url: `${baseUrl}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: releaseToken
          ? `${baseUrl}/booking/cancel?holdId=${encodeURIComponent(holdId)}&release_token=${encodeURIComponent(releaseToken)}`
          : `${baseUrl}/booking/cancel?holdId=${encodeURIComponent(holdId)}`,
      });
    } catch (sessionErr) {
      if (stripeCouponId) {
        try {
          await stripe.coupons.del(stripeCouponId);
        } catch (delErr) {
          console.error("[create-checkout-session-direct] Failed to delete orphaned coupon", stripeCouponId, delErr);
        }
      }
      try {
        const bookingMode = (holdPayload as { bookingMode?: string }).bookingMode;
        const isSharedTicketed = bookingMode === "shared" && !!holdPayload.experienceId;
        const parsedSlot = holdPayload.slotId ? parseSlotId(holdPayload.slotId as string) : null;
        const inventoryRef = isSharedTicketed && parsedSlot && holdPayload.experienceId
          ? getDepartureInventoryRef(db, holdPayload.experienceId as string, parsedSlot.dateStr)
          : null;
        await db.runTransaction(async (tx) => {
          const slotSnap = await tx.get(slotRef);
          if (slotSnap.exists && (slotSnap.data() as { holdId?: string }).holdId === holdId) {
            tx.update(slotRef, { status: "open", holdId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
          }
          if (inventoryRef && typeof holdPayload.partySize === "number") {
            await releaseCapacity(tx, inventoryRef, holdPayload.partySize);
          }
          tx.update(db.collection("holds").doc(holdId), { status: "expired" });
        });
      } catch {
        /* best-effort */
      }
      throw sessionErr;
    }

    if (session.url) {
      const holdUpdate: Record<string, unknown> = { checkoutSessionId: session.id };
      if (stripeCouponId) holdUpdate.stripeCouponId = stripeCouponId;
      await db.collection("holds").doc(holdId).update(holdUpdate);
      return NextResponse.json({ url: session.url, sessionId: session.id });
    }
    return NextResponse.json({ error: "Checkout session failed" }, { status: 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Direct checkout failed";
    if (err instanceof SlotConflictError || message === "Slot no longer available" || message === "This slot is blocked") {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("[create-checkout-session-direct]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
