import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getSlotStartEnd, parseSlotId, isAllowedSlotTime, isSeasonalAllowed } from "@/lib/booking/experience-slots";
import { getDepartureInventoryRef, getReservedSeats } from "@/lib/booking/shared-departure-inventory";
import {
  acquireCheckoutSessionCreationLock,
  clearSessionCreationInflight,
  persistCheckoutSessionOnHoldWithRetry,
  rollbackCheckoutSession,
} from "@/lib/booking/checkout-session-helpers";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { fetchListingBoatsForExperience } from "@/lib/booking/listing-boat-resolution";
import { assertSlotAvailable, SlotConflictError } from "@/lib/booking/slot-availability";
import { BlockCheckUnavailableError } from "@/lib/booking/has-overlapping-block";
import { getStripe, buildLineItems, buildLineItemsFromHoldPricing } from "@/lib/booking/stripe-client";
import { buildAddonSelectionsForPricing, computePricing, getEffectiveRatePriceCents } from "@/lib/booking/pricing";
import { resolveHoldBookingPricing } from "@/lib/booking/hold-charge-resolver";
import { validateAndApplyDiscount } from "@/lib/booking/discount";
import { bookingEnv } from "@/lib/booking/env";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";
import { generateIncidentCode, bookingError } from "@/lib/booking/debug";
import { signReleaseToken } from "@/lib/booking/releaseToken";
import { signReceiptClaimToken } from "@/lib/booking/receiptToken";
import { HOLD_PAYMENT_ATTEMPT_VERSION_META } from "@/lib/booking/constants";
import type { Experience, ExperienceRate, ExperienceAddon, Slot, ListingBoat } from "@/lib/booking/types";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
import { DIRECT_CHECKOUT_HOLD_EXPIRY_MINUTES } from "@/lib/booking/constants";

/** Unique placeholder per hold to avoid Stripe customer index conflicts across concurrent direct checkouts. */
function placeholderCustomerForHold(holdId: string) {
  return {
    name: "Checkout",
    email: `checkout+${holdId}@pending.internal`,
    phone: "+15555555555",
  };
}

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
  let rollbackHoldId: string | undefined;
  let rollbackHoldPayload: Record<string, unknown> | undefined;
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

    const [expDoc, ratesSnap, addonsSnap] = await Promise.all([
      db.collection("experiences").doc(input.experienceId).get(),
      db.collection("experiences").doc(input.experienceId).collection("rates").where("active", "==", true).get(),
      db.collection("experiences").doc(input.experienceId).collection("addons").get(),
    ]);

    if (!expDoc.exists) {
      return NextResponse.json({ error: "Experience not found" }, { status: 404 });
    }
    const experience = expDoc.data() as Experience;
    const expSlug = typeof experience.slug === "string" ? experience.slug.trim() : "";
    const { docs: listingBoatDocs } = await fetchListingBoatsForExperience(db, input.experienceId, expSlug);
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
    const listingBoatIds = listingBoatDocs.map((d) => d.id);
    const hasListingBoats = listingBoatIds.length > 0;
    if (hasListingBoats && !input.boatId && listingBoatIds.length === 1) {
      input.boatId = listingBoatIds[0];
    }
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
      ? (listingBoatDocs.find((d) => d.id === input.boatId)?.data() as ListingBoat | undefined)
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
    let discountRef: import("firebase-admin").firestore.DocumentReference | null = null;
    if (input.discountCode) {
      const discountSnap = await db.collection("discounts").where("code", "==", input.discountCode).limit(1).get();
      const discountDoc = discountSnap.empty ? null : (discountSnap.docs[0].data() as import("@/lib/booking/types").Discount);
      const result = validateAndApplyDiscount(discountDoc, pricing.totalCents);
      if (!result.valid) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      discountCents = result.discountCents;
      discountCodeApplied = result.discount.code;
      if (!discountSnap.empty) discountRef = discountSnap.docs[0].ref;
    }

    const holdId = db.collection("holds").doc().id;
    rollbackHoldId = holdId;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DIRECT_CHECKOUT_HOLD_EXPIRY_MINUTES * 60 * 1000);
    const holdPayload: Record<string, unknown> = {
      experienceId: input.experienceId,
      slotId: input.slotId,
      startDateStr: parsed.dateStr,
      rateId,
      addonSelections: [] as { addonId: string; qty: number }[],
      partySize: input.partySize,
      petsCount: input.petsCount,
      answers: {} as Record<string, string>,
      customerDraft: placeholderCustomerForHold(holdId),
      marketingOptIn: false,
      status: "active",
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: FieldValue.serverTimestamp(),
      paymentAttemptVersion: 1,
    };
    if (input.boatId) holdPayload.boatId = input.boatId;
    if (discountCodeApplied && discountCents > 0) {
      holdPayload.discountCode = discountCodeApplied;
      holdPayload.discountCents = discountCents;
    }
    holdPayload.pricing = { ...pricing, currency: pricing.currency ?? "usd" };
    holdPayload.effectiveRateCents = rateForPricing.priceCents;
    rollbackHoldPayload = holdPayload;

    await db.runTransaction(async (tx) => {
      if (discountRef) {
        const discountSnapTx = await tx.get(discountRef);
        if (discountSnapTx.exists) {
          const d = discountSnapTx.data() as { usedCount?: number; maxRedemptions?: number };
          const used = d.usedCount ?? 0;
          const max = d.maxRedemptions;
          if (typeof max === "number" && used >= max) {
            throw new Error("This code has reached its usage limit");
          }
          tx.update(discountRef, { usedCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
        }
      }
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
    const holdTyped = hold as unknown as import("@/lib/booking/types").Hold;
    let resolvedDirect: Awaited<ReturnType<typeof resolveHoldBookingPricing>>;
    try {
      resolvedDirect = await resolveHoldBookingPricing(db, holdTyped, { mode: "checkout" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "RATE_NOT_FOUND" || msg === "BOAT_NOT_FOUND") {
        await rollbackCheckoutSession(db, holdId, holdPayload as import("@/lib/booking/checkout-session-helpers").HoldLike, { FieldValue, Timestamp });
        return NextResponse.json({ error: "Rate not found" }, { status: 404 });
      }
      throw e;
    }
    const {
      pricing: pricingForLineItems,
      rateForPricing: rateForLineItems,
      addonsForPricing: addonsForLineItems,
      useSnapshotLineItems: useSnapLineItems,
      ticketQtyForLineItems: ticketQtyLi,
    } = resolvedDirect;
    const lineItems = useSnapLineItems
      ? buildLineItemsFromHoldPricing({
          pricing: pricingForLineItems,
          rate: rateForLineItems as import("@/lib/booking/types").Rate | import("@/lib/booking/types").ExperienceRate,
          hold: holdTyped,
          ticketQty: ticketQtyLi,
        })
      : buildLineItems({
          pricing: pricingForLineItems,
          rate: rateForLineItems as import("@/lib/booking/types").Rate | import("@/lib/booking/types").ExperienceRate,
          addons: addonsForLineItems,
          hold: holdTyped,
          ticketQty: ticketQtyLi,
        });
    const lineItemSumCents = lineItems.reduce((acc, li) => {
      const u = li.price_data?.unit_amount;
      const q = typeof li.quantity === "number" && Number.isFinite(li.quantity) ? li.quantity : 1;
      return acc + (typeof u === "number" && Number.isFinite(u) ? u * q : 0);
    }, 0);
    const tipCentsSanity = (holdTyped as { tipCents?: number }).tipCents ?? 0;
    const holdDiscountCentsDirect = (holdTyped as { discountCents?: number }).discountCents ?? 0;
    const expectedLineItemsCents = pricingForLineItems.totalCents + tipCentsSanity;
    if (Math.abs(lineItemSumCents - expectedLineItemsCents) > 1) {
      const diagnostic = {
        lineItemSumCents,
        expectedLineItemsCents,
        pricingTotalCents: pricingForLineItems.totalCents,
        tipCents: tipCentsSanity,
        discountCents: holdDiscountCentsDirect,
        holdId,
      };
      console.error("[create-checkout-session-direct] Line item sum mismatch; aborting Checkout Session creation", diagnostic);
      await rollbackCheckoutSession(db, holdId, holdPayload as import("@/lib/booking/checkout-session-helpers").HoldLike, { FieldValue, Timestamp });
      return NextResponse.json(
        { error: "Checkout is temporarily unavailable. Please try again." },
        { status: 500 }
      );
    }
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
    const versionMeta = { [HOLD_PAYMENT_ATTEMPT_VERSION_META]: "1" };
    const metadata: Record<string, string> = {
      holdId,
      slotId: input.slotId,
      rateId,
      experienceId: input.experienceId,
      ...versionMeta,
    };
    if (input.boatId) metadata.boatId = input.boatId;
    const paymentIntentMetadata: Record<string, string> = {
      holdId,
      slotId: input.slotId,
      rateId,
      experienceId: input.experienceId,
      ...versionMeta,
    };
    const releaseToken = signReleaseToken(holdId, Math.floor(expiresAt.getTime() / 1000));
    const receiptClaimToken = signReceiptClaimToken(holdId);
    const holdRefDirect = db.collection("holds").doc(holdId);
    const lockResult = await acquireCheckoutSessionCreationLock(db, holdRefDirect, Timestamp, "redirect");
    if (lockResult.kind === "hold_inactive") {
      await rollbackCheckoutSession(db, holdId, holdPayload as import("@/lib/booking/checkout-session-helpers").HoldLike, { FieldValue, Timestamp });
      return NextResponse.json({ error: "Hold expired or unavailable" }, { status: 400 });
    }
    if (lockResult.kind === "conflict") {
      return NextResponse.json(
        { error: "Checkout session is being created; please retry in a moment." },
        { status: 409 }
      );
    }
    if (lockResult.kind === "use_existing") {
      try {
        const existingSession = await stripe.checkout.sessions.retrieve(lockResult.checkoutSessionId);
        if (existingSession.status === "open" && existingSession.url) {
          return NextResponse.json({ url: existingSession.url, sessionId: existingSession.id });
        }
      } catch {
        /* fall through to create */
      }
      return NextResponse.json(
        { error: "Checkout session is being created; please retry in a moment." },
        { status: 409 }
      );
    }

    let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: lineItems,
        ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
        customer_email: undefined,
        custom_fields: [
          { key: "special_notes", label: { type: "custom", custom: "Special requests (optional)" }, type: "text" },
        ],
        metadata,
        payment_intent_data: { metadata: paymentIntentMetadata },
        success_url: `${baseUrl}/booking/success?session_id={CHECKOUT_SESSION_ID}&receipt_token=${encodeURIComponent(receiptClaimToken ?? "")}`,
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
      await clearSessionCreationInflight(holdRefDirect, FieldValue);
      await rollbackCheckoutSession(db, holdId, holdPayload as import("@/lib/booking/checkout-session-helpers").HoldLike, { FieldValue, Timestamp });
      throw sessionErr;
    }

    if (session.url) {
      const holdUpdate: Record<string, unknown> = { checkoutSessionId: session.id, checkoutSessionMode: "redirect" as const };
      if (stripeCouponId) holdUpdate.stripeCouponId = stripeCouponId;
      const paymentIntentIdFromSession =
        typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
      if (paymentIntentIdFromSession) {
        holdUpdate.fullPaymentIntentId = paymentIntentIdFromSession;
      } else {
        try {
          const expanded = await stripe.checkout.sessions.retrieve(session.id, { expand: ["payment_intent"] });
          const piId = typeof expanded.payment_intent === "object" && expanded.payment_intent?.id
            ? expanded.payment_intent.id
            : typeof expanded.payment_intent === "string"
              ? expanded.payment_intent
              : null;
          if (piId) holdUpdate.fullPaymentIntentId = piId;
        } catch (retrieveErr) {
          bookingError(
            "create-checkout-session-direct",
            "Could not persist payment intent on hold (retrieve expanded session failed)",
            retrieveErr,
            { holdId, sessionId: session.id }
          );
        }
      }
      const persistResult = await persistCheckoutSessionOnHoldWithRetry(
        db,
        holdRefDirect,
        holdId,
        session.id,
        holdUpdate,
        { FieldValue, Timestamp },
        stripe
      );
      if (persistResult.ok === false && persistResult.reason === "lost_race") {
        return NextResponse.json(
          { error: "Checkout session is being created; please retry in a moment." },
          { status: 409 }
        );
      }
      if (persistResult.ok === false && persistResult.reason === "hold_inactive") {
        return NextResponse.json({ error: "Hold expired or unavailable" }, { status: 400 });
      }
      const piIdForMeta =
        (typeof holdUpdate.fullPaymentIntentId === "string" ? holdUpdate.fullPaymentIntentId : null) ??
        (typeof paymentIntentIdFromSession === "string" ? paymentIntentIdFromSession : null);
      if (piIdForMeta) {
        try {
          const piExisting = await stripe.paymentIntents.retrieve(piIdForMeta);
          await stripe.paymentIntents.update(piIdForMeta, {
            metadata: { ...piExisting.metadata, checkoutSessionId: session.id },
          });
        } catch (metaErr) {
          bookingError(
            "create-checkout-session-direct",
            "Could not attach checkoutSessionId to PaymentIntent metadata",
            metaErr,
            { holdId, sessionId: session.id, paymentIntentIdPrefix: piIdForMeta.slice(0, 12) }
          );
        }
      }
      return NextResponse.json({ url: session.url, sessionId: session.id });
    }
    return NextResponse.json({ error: "Checkout session failed" }, { status: 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Direct checkout failed";
    if (err instanceof BlockCheckUnavailableError) {
      return NextResponse.json(
        { error: "Unable to verify availability. Please try again shortly.", code: "block_check_unavailable" },
        { status: 503 }
      );
    }
    if (err instanceof SlotConflictError || message === "Slot no longer available" || message === "This slot is blocked") {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (rollbackHoldId && rollbackHoldPayload) {
      try {
        const dbRollback = getDb();
        const { FieldValue: FV, Timestamp: Ts } = getFirestoreExports();
        await rollbackCheckoutSession(dbRollback, rollbackHoldId, rollbackHoldPayload as import("@/lib/booking/checkout-session-helpers").HoldLike, {
          FieldValue: FV,
          Timestamp: Ts,
        });
      } catch (rollbackErr) {
        console.error("[create-checkout-session-direct] rollback after error failed", rollbackErr);
      }
    }
    console.error("[create-checkout-session-direct]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
