import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getSlotStartEnd, parseSlotId, isAllowedSlotTime, isSeasonalAllowed } from "@/lib/booking/experience-slots";
import { getDepartureInventoryRef, getReservedSeats } from "@/lib/booking/shared-departure-inventory";
import {
  acquireCheckoutSessionCreationLock,
  cleanupOrphanedCoupon,
  clearSessionCreationInflight,
  createStripeCheckoutSessionForHold,
  rollbackCheckoutSession,
} from "@/lib/booking/checkout-session-helpers";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { fetchListingBoatsForExperience } from "@/lib/booking/listing-boat-resolution";
import {
  assertSlotAvailable,
  SlotConflictError,
  LegacyScanLimitReachedError,
  assertNoOverlappingActiveSameDaySlots,
  transactionGetQueryOrDoc,
} from "@/lib/booking/slot-availability";
import { BlockCheckUnavailableError } from "@/lib/booking/has-overlapping-block";
import { getStripe, buildLineItems, buildLineItemsFromHoldPricing, assertLiveAddonPricesMatchHoldSnapshot } from "@/lib/booking/stripe-client";
import {
  buildAddonSelectionsForPricing,
  computePricing,
  getEffectiveBoatRatePriceCents,
  getEffectiveRatePriceCents,
} from "@/lib/booking/pricing";
import { fetchMergedPricingCalendarRatesForBoatTypes } from "@/lib/booking/pricing-calendar-fetch";
import { resolveHoldBookingPricing } from "@/lib/booking/hold-charge-resolver";
import { validateAndApplyDiscount } from "@/lib/booking/discount";
import type { Discount } from "@/lib/booking/types";
import { bookingEnv } from "@/lib/booking/env";
import { checkRateLimitSensitiveMutation, getClientKey } from "@/lib/booking/rate-limit";
import { bookingError, bookingWarn, generateIncidentCode } from "@/lib/booking/debug";
import { createHold503Payload, type CreateHold503Code } from "@/lib/booking/create-hold-errors";
import { hasReleaseTokenSecret, signReleaseToken } from "@/lib/booking/releaseToken";
import { signReceiptClaimToken } from "@/lib/booking/receiptToken";
import { HOLD_PAYMENT_ATTEMPT_VERSION_META } from "@/lib/booking/constants";
import { HOLD_CHECKOUT_SESSION_EXTENSION_MINUTES, MAX_HOLD_LIFETIME_FROM_CREATED_MS } from "@/lib/booking/hold-expiry";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import type { Experience, ExperienceRate, ExperienceAddon, Slot, ListingBoat, Hold } from "@/lib/booking/types";
import { HOLD_REQUEST_CLAIMS_COLLECTION, computeDirectCheckoutHoldRequestFingerprint } from "@/lib/booking/hold-request-idempotency";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
import { DIRECT_CHECKOUT_HOLD_EXPIRY_MINUTES } from "@/lib/booking/constants";
import { buildCheckoutSessionIdempotencyKey } from "@/lib/booking/stripe-idempotency-keys";

function json503Direct(incidentId: string, code: CreateHold503Code, error: string) {
  return NextResponse.json(createHold503Payload(incidentId, code, error), { status: 503 });
}

class DirectCheckoutResumeHold extends Error {
  constructor(public readonly resumeHoldId: string) {
    super("DIRECT_CHECKOUT_RESUME_HOLD");
    this.name = "DirectCheckoutResumeHold";
  }
}

async function tryReturnExistingDirectCheckoutSessionForHold(
  db: import("firebase-admin/firestore").Firestore,
  stripe: import("stripe").Stripe,
  holdId: string
): Promise<{ url: string; sessionId: string } | null> {
  const holdSnap = await db.collection("holds").doc(holdId).get();
  if (!holdSnap.exists) return null;
  const h = holdSnap.data() as Hold & { checkoutSessionId?: string };
  if (h.status !== "active") return null;
  const exp = h.expiresAt as { toDate(): Date } | undefined;
  if (!exp || exp.toDate() < new Date()) return null;
  const csId = typeof h.checkoutSessionId === "string" ? h.checkoutSessionId.trim() : "";
  if (!csId) return null;
  try {
    const sess = await stripe.checkout.sessions.retrieve(csId);
    if (sess.status === "open" && sess.url) return { url: sess.url, sessionId: sess.id };
  } catch {
    return null;
  }
  return null;
}

/** Unique placeholder per hold to avoid Stripe customer index conflicts across concurrent direct checkouts. */
function placeholderCustomerForHold(holdId: string) {
  return {
    name: "Checkout",
    email: `checkout+${holdId}@pending.internal`,
    phone: "+15555555555",
  };
}

function parseBody(body: unknown): {
  experienceId: string;
  slotId: string;
  boatId?: string;
  partySize: number;
  petsCount: number;
  discountCode?: string;
  customerEmail?: string;
} | null {
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
  const customerEmail = typeof o.customerEmail === "string" ? o.customerEmail.trim() : undefined;
  return {
    experienceId,
    slotId,
    boatId,
    partySize,
    petsCount,
    discountCode: discountCode || undefined,
    ...(customerEmail ? { customerEmail } : {}),
  };
}

export async function POST(request: NextRequest) {
  let rollbackHoldId: string | undefined;
  let rollbackHoldPayload: Record<string, unknown> | undefined;
  try {
    const rl = await checkRateLimitSensitiveMutation(getClientKey(request));
    if (!rl.allowed) {
      if (rl.serverError) {
        const incidentId = generateIncidentCode();
        bookingWarn("create-checkout-session-direct", "rate limit service unavailable (503)", {
          incidentId,
          reason: "Redis unavailable or timeout; RATE_LIMIT_FAIL_CLOSED=1",
        });
        return json503Direct(
          incidentId,
          "rate_limit_unavailable",
          "Service temporarily unavailable. Please try again shortly."
        );
      }
      const retryAfter = rl.retryAfterMs ? Math.ceil(rl.retryAfterMs / 1000) : 60;
      return NextResponse.json(
        { error: "Too many requests. Please try again in a moment." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
    if (rl.degraded) {
      bookingWarn("create-checkout-session-direct", "rate limit degraded, request allowed", {});
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

    if (!hasReleaseTokenSecret()) {
      bookingError("create-checkout-session-direct", "RELEASE_TOKEN_SECRET is not set; refusing direct checkout session creation", null, {
        nodeEnv: process.env.NODE_ENV ?? "",
      });
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
          {
            error:
              "Booking payments are temporarily unavailable (server configuration: RELEASE_TOKEN_SECRET). Set the secret and redeploy.",
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        {
          error:
            "RELEASE_TOKEN_SECRET is required for checkout. Set it in your environment (e.g. .env.local for local development).",
        },
        { status: 503 }
      );
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
      // Ticketed flows must use the booking modal (create-hold → Elements / Checkout). Shared ticketed holds use
      // departureInventory only via that path — do not route them through this direct-checkout endpoint.
      return NextResponse.json(
        {
          ticketedFlowRequired: true,
          message: "This experience requires selecting a date and tickets first.",
          bookingUrl: `/booking?experienceId=${input.experienceId}`,
        },
        { status: 400 }
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
    /** Optional early-out when the slot doc clearly cannot be taken (performance). Not authoritative — the transaction below re-reads the slot and runs `assertSlotAvailable`. */
    const slotDoc = await slotRef.get();
    let slotStart: Date;
    if (slotDoc.exists) {
      const slotData = slotDoc.data() as Slot;
      slotStart = (slotData.startAt as { toDate(): Date }).toDate();
      // Do not treat `status: "held"` as a terminal 409 here: the hold may have expired by transaction time.
      if (slotData.status !== "open" && slotData.status !== "held") {
        return NextResponse.json({ error: "Slot no longer available" }, { status: 409 });
      }
    } else {
      slotStart = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0).start;
    }
    if (slotStart.getTime() < Date.now()) {
      return NextResponse.json({ error: "This time slot is in the past" }, { status: 400 });
    }
    if (!isSeasonalAllowed(experience.seasonal, slotStart, parsed.dateStr)) {
      return NextResponse.json({ error: "Experience not available for this date" }, { status: 400 });
    }
    const addonsById = new Map<string, ExperienceAddon>();
    addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as ExperienceAddon));
    const addonsForPricing = buildAddonSelectionsForPricing([], addonsById);
    let rateForPricing = {
      ...rate,
      priceCents: getEffectiveRatePriceCents(rate, slotStart, experience.holidayDates, experience.weekendDays, experience.friSunDays),
    };
    if (input.boatId && selectedBoat) {
      const bt = typeof selectedBoat.boatType === "string" ? selectedBoat.boatType.trim() : "";
      const calendarRates = bt ? await fetchMergedPricingCalendarRatesForBoatTypes(db, [bt]) : undefined;
      const overrides = Array.isArray(selectedBoat.priceOverrides) ? selectedBoat.priceOverrides : undefined;
      rateForPricing = {
        ...rate,
        priceCents: getEffectiveBoatRatePriceCents(
          {
            durationHours: rate.durationHours ?? 0,
            priceCents: rate.priceCents,
            priceWeekendCents: rate.priceWeekendCents,
            priceFriSunCents: rate.priceFriSunCents,
            priceHolidayCents: rate.priceHolidayCents,
          },
          slotStart,
          experience.holidayDates,
          overrides,
          calendarRates,
          experience.weekendDays,
          experience.friSunDays
        ),
      };
    }
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

    const discountCodeForFingerprint = discountCodeApplied ?? (input.discountCode ? input.discountCode : undefined);
    const emailForFingerprint = (input.customerEmail ?? "").trim().toLowerCase();
    const holdRequestFingerprint = computeDirectCheckoutHoldRequestFingerprint({
      experienceId: input.experienceId,
      slotId: input.slotId,
      boatId: input.boatId,
      partySize: input.partySize,
      petsCount: input.petsCount,
      discountCode: discountCodeForFingerprint,
      customerEmail: emailForFingerprint,
    });
    const holdRequestId = `d${holdRequestFingerprint}`;

    const claimRefReserve = db.collection(HOLD_REQUEST_CLAIMS_COLLECTION).doc(holdRequestId);
    let claimReserved = false;
    try {
      await claimRefReserve.create({
        requestFingerprint: holdRequestFingerprint,
        createdAt: FieldValue.serverTimestamp(),
        expireAt: Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      claimReserved = true;
    } catch (e: unknown) {
      const err = e as { code?: number | string };
      const isAlreadyExists = err?.code === 6 || err?.code === "already-exists";
      if (!isAlreadyExists) throw e;
      const claimSnapPre = await claimRefReserve.get();
      if (claimSnapPre.exists) {
        const c = claimSnapPre.data() as { requestFingerprint?: string; holdId?: string };
        if (c.requestFingerprint !== holdRequestFingerprint) {
          return NextResponse.json(
            {
              error: "This booking request id was already used with different selections. Start over or change your details.",
              code: "hold_request_payload_mismatch",
            },
            { status: 409 }
          );
        }
        if (typeof c.holdId === "string" && c.holdId.trim()) {
          const stripeEarly = getStripe();
          const existingPre = await tryReturnExistingDirectCheckoutSessionForHold(db, stripeEarly, c.holdId.trim());
          if (existingPre) {
            return NextResponse.json({ url: existingPre.url, sessionId: existingPre.sessionId });
          }
        }
      }
      const idemSnapPre = await db.collection("holds").where("clientHoldRequestId", "==", holdRequestId).limit(2).get();
      const stripeIdem = getStripe();
      for (const d of idemSnapPre.docs) {
        const h = d.data() as Hold;
        if (h.experienceId !== input.experienceId || h.slotId !== input.slotId) continue;
        const expH = h.expiresAt as { toDate(): Date };
        if (h.status !== "active" || expH.toDate() < new Date()) continue;
        const sameBoat = !input.boatId ? !h.boatId : h.boatId === input.boatId;
        if (!sameBoat) continue;
        const existingIdem = await tryReturnExistingDirectCheckoutSessionForHold(db, stripeIdem, d.id);
        if (existingIdem) {
          return NextResponse.json({ url: existingIdem.url, sessionId: existingIdem.sessionId });
        }
      }
      return NextResponse.json(
        { error: "Checkout is already in progress for this selection. Please retry in a moment." },
        { status: 409 }
      );
    }

    const holdId = db.collection("holds").doc().id;
    rollbackHoldId = holdId;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DIRECT_CHECKOUT_HOLD_EXPIRY_MINUTES * 60 * 1000);
    const holdPayload: Record<string, unknown> = {
      experienceId: input.experienceId,
      slotId: input.slotId,
      bookingMode: "charter",
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
    if (holdRequestId) holdPayload.clientHoldRequestId = holdRequestId;
    // Discount fields and usedCount are applied in the same Firestore transaction as checkoutSessionId
    // (see persistCheckoutSessionOnHoldWithRetry / createStripeCheckoutSessionForHold).
    const totalCentsForHoldDirect = Math.max(0, pricing.totalCents - discountCents);
    holdPayload.pricing = { ...pricing, totalCents: totalCentsForHoldDirect, currency: pricing.currency ?? "usd" };
    holdPayload.effectiveRateCents = rateForPricing.priceCents;
    rollbackHoldPayload = holdPayload;

    // Double-booking prevention for a given slot is enforced inside this Firestore transaction: we read the slot
    // document (or create it), run `assertSlotAvailable`, and write `status: "held"` + hold id atomically.
    // Concurrent direct-checkout POSTs for the same slot id are serialized by Firestore; one succeeds and the
    // other observes a conflict (e.g. SlotConflictError → 409). See Firebase docs on transaction isolation:
    // https://firebase.google.com/docs/firestore/transactions
    try {
      await db.runTransaction(async (tx) => {
        const nowTx = new Date();
        if (holdRequestId && holdRequestFingerprint) {
          const claimRefTx = db.collection(HOLD_REQUEST_CLAIMS_COLLECTION).doc(holdRequestId);
          const claimSnapTx = await tx.get(claimRefTx);
          if (claimSnapTx.exists) {
            const c = claimSnapTx.data() as { requestFingerprint?: string; holdId?: string };
            if (c.requestFingerprint !== holdRequestFingerprint) {
              throw new Error("HOLD_REQUEST_ID_PAYLOAD_CONFLICT");
            }
            const claimedHoldId = typeof c.holdId === "string" && c.holdId.trim() ? c.holdId.trim() : null;
            if (claimedHoldId) {
              const chSnap = await tx.get(db.collection("holds").doc(claimedHoldId));
              if (chSnap.exists) {
                const ch = chSnap.data() as Hold;
                const cexp = ch.expiresAt as { toDate(): Date } | undefined;
                const cexpiry = cexp?.toDate?.() ?? new Date(0);
                const cActive = ch.status === "active" && cexpiry > nowTx;
                const cSameSlot = ch.slotId === input.slotId;
                const cSameExp = ch.experienceId === input.experienceId;
                const cSameBoat = !input.boatId ? !ch.boatId : ch.boatId === input.boatId;
                if (cActive && cSameSlot && cSameExp && cSameBoat) {
                  throw new DirectCheckoutResumeHold(claimedHoldId);
                }
              }
            }
          }
          const idemSnapTx = await tx.get(
            db.collection("holds").where("clientHoldRequestId", "==", holdRequestId).limit(2)
          );
          for (const d of idemSnapTx.docs) {
            const h = d.data() as Hold;
            const exp = h.expiresAt as { toDate(): Date };
            const expiryDate = exp.toDate();
            const isActive = h.status === "active" && expiryDate > nowTx;
            const sameSlot = h.slotId === input.slotId;
            const sameExp = h.experienceId === input.experienceId;
            const sameBoat = !input.boatId ? !h.boatId : h.boatId === input.boatId;
            if (isActive && sameSlot && sameExp && sameBoat) {
              throw new DirectCheckoutResumeHold(d.id);
            }
          }
        }
        if (discountRef) {
          const discountSnapTx = await tx.get(discountRef);
          if (discountSnapTx.exists) {
            const discountLive = discountSnapTx.data() as Discount;
            const recheck = validateAndApplyDiscount(discountLive, pricing.totalCents);
            if (!recheck.valid) throw new Error(recheck.error);
            if (recheck.discountCents !== discountCents || recheck.discount.code !== discountCodeApplied) {
              throw new Error("Discount changed while booking; please try again");
            }
          }
        }
        const slotSnap = await tx.get(slotRef);
        if (slotSnap.exists) {
          const slot = slotSnap.data() as Slot;
          if (slot.status !== "open") throw new SlotConflictError("Slot no longer available");
          const slotStartDate = (slot.startAt as { toDate(): Date }).toDate();
          const slotEndDate = (slot.endAt as { toDate(): Date }).toDate();
          await assertNoOverlappingActiveSameDaySlots({
            db,
            Timestamp,
            get: (refOrQuery) => transactionGetQueryOrDoc(tx, refOrQuery),
            experienceId: input.experienceId,
            boatId: input.boatId,
            useBoatSlots,
            parsed,
            slotStart: slotStartDate,
            slotEnd: slotEndDate,
            now: nowTx,
          });
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
        if (holdRequestId && holdRequestFingerprint) {
          const claimRefOut = db.collection(HOLD_REQUEST_CLAIMS_COLLECTION).doc(holdRequestId);
          tx.set(
            claimRefOut,
            {
              requestFingerprint: holdRequestFingerprint,
              holdId,
              updatedAt: FieldValue.serverTimestamp(),
              expireAt: Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
            },
            { merge: true }
          );
        }
      });
    } catch (e) {
      if (e instanceof DirectCheckoutResumeHold) {
        const stripeResume = getStripe();
        const existingResume = await tryReturnExistingDirectCheckoutSessionForHold(db, stripeResume, e.resumeHoldId);
        if (existingResume) {
          return NextResponse.json({ url: existingResume.url, sessionId: existingResume.sessionId });
        }
        return NextResponse.json(
          { error: "Checkout session is being created; please retry in a moment." },
          { status: 409 }
        );
      }
      if (e instanceof Error && e.message === "HOLD_REQUEST_ID_PAYLOAD_CONFLICT") {
        return NextResponse.json(
          {
            error: "This booking request id was already used with different selections. Start over or change your details.",
            code: "hold_request_payload_mismatch",
          },
          { status: 409 }
        );
      }
      if (claimReserved) {
        await claimRefReserve.delete().catch(() => {});
      }
      throw e;
    }

    const holdPayloadForPricing: Record<string, unknown> = {
      ...holdPayload,
      ...(discountCodeApplied && discountCents > 0 && discountRef
        ? {
            discountCode: discountCodeApplied,
            discountCents,
            discountDocId: discountRef.id,
          }
        : {}),
    };
    const hold = { ...holdPayloadForPricing, expiresAt: holdPayload.expiresAt };
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
    let lineItems: import("stripe").Stripe.Checkout.SessionCreateParams.LineItem[];
    if (useSnapLineItems) {
      const fromHold = buildLineItemsFromHoldPricing({
        pricing: pricingForLineItems,
        rate: rateForLineItems as import("@/lib/booking/types").Rate | import("@/lib/booking/types").ExperienceRate,
        hold: holdTyped,
        ticketQty: ticketQtyLi,
        holdIdForLog: holdId,
      });
      if (fromHold == null) {
        const liveCheck = assertLiveAddonPricesMatchHoldSnapshot(holdTyped, addonsForLineItems);
        if (!liveCheck.ok) {
          const rb = await rollbackCheckoutSession(
            db,
            holdId,
            holdPayload as import("@/lib/booking/checkout-session-helpers").HoldLike,
            { FieldValue, Timestamp }
          );
          if (!rb.ok) {
            await writeOperationalAlert({
              type: "rollback_checkout_session_failed",
              holdId,
              source: "create-checkout-session-direct",
              error: rb.error instanceof Error ? rb.error.message : String(rb.error),
            });
          }
          await writeOperationalAlert({
            type: "checkout_addon_snapshot_live_price_mismatch",
            holdId,
            addonId: liveCheck.addonId,
            snapshotCents: liveCheck.snapshotCents,
            liveCents: liveCheck.liveCents,
            source: "create-checkout-session-direct",
          });
          return NextResponse.json(
            { error: "Checkout is temporarily unavailable. Please try again." },
            { status: 500 }
          );
        }
      }
      lineItems =
        fromHold ??
        buildLineItems({
          pricing: pricingForLineItems,
          rate: rateForLineItems as import("@/lib/booking/types").Rate | import("@/lib/booking/types").ExperienceRate,
          addons: addonsForLineItems,
          hold: holdTyped,
          ticketQty: ticketQtyLi,
        });
    } else {
      lineItems = buildLineItems({
        pricing: pricingForLineItems,
        rate: rateForLineItems as import("@/lib/booking/types").Rate | import("@/lib/booking/types").ExperienceRate,
        addons: addonsForLineItems,
        hold: holdTyped,
        ticketQty: ticketQtyLi,
      });
    }
    const lineItemSumCents = lineItems.reduce((acc, li) => {
      const u = li.price_data?.unit_amount;
      const q = typeof li.quantity === "number" && Number.isFinite(li.quantity) ? li.quantity : 1;
      return acc + (typeof u === "number" && Number.isFinite(u) ? u * q : 0);
    }, 0);
    const tipCentsSanity = (holdTyped as { tipCents?: number }).tipCents ?? 0;
    const holdDiscountCentsDirect = (holdTyped as { discountCents?: number }).discountCents ?? 0;
    // Line-item sum matches pre-discount `pricing.totalCents`; discount is applied via Stripe coupon, not line items.
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
      const rbMismatch = await rollbackCheckoutSession(
        db,
        holdId,
        holdPayload as import("@/lib/booking/checkout-session-helpers").HoldLike,
        { FieldValue, Timestamp }
      );
      if (!rbMismatch.ok) {
        await writeOperationalAlert({
          type: "rollback_checkout_session_failed",
          holdId,
          source: "create-checkout-session-direct",
          error: rbMismatch.error instanceof Error ? rbMismatch.error.message : String(rbMismatch.error),
        });
      }
      return NextResponse.json(
        { error: "Checkout is temporarily unavailable. Please try again." },
        { status: 500 }
      );
    }
    const baseUrl = bookingEnv.appBaseUrl;
    const stripe = getStripe();
    const holdPaymentAttemptVersionForCoupon =
      typeof (holdPayload as { paymentAttemptVersion?: number }).paymentAttemptVersion === "number"
        ? (holdPayload as { paymentAttemptVersion: number }).paymentAttemptVersion
        : 1;
    let stripeCouponId: string | undefined;
    const versionMeta = { [HOLD_PAYMENT_ATTEMPT_VERSION_META]: String(holdPaymentAttemptVersionForCoupon) };
    const metadata: Record<string, string> = {
      holdId,
      slotId: input.slotId,
      rateId,
      experienceId: input.experienceId,
      ...versionMeta,
    };
    if (input.boatId) metadata.boatId = input.boatId;
    const totalCentsForPiMeta = Math.max(
      0,
      pricingForLineItems.totalCents + tipCentsSanity - holdDiscountCentsDirect
    );
    const paymentIntentMetadata: Record<string, string> = {
      holdId,
      slotId: input.slotId,
      rateId,
      experienceId: input.experienceId,
      payment_stage: "full",
      totalCents: String(totalCentsForPiMeta),
      ...versionMeta,
    };
    const releaseToken = signReleaseToken(holdId, Math.floor(expiresAt.getTime() / 1000));
    const receiptClaimToken = signReceiptClaimToken(holdId);
    const holdRefDirect = db.collection("holds").doc(holdId);
    const lockResult = await acquireCheckoutSessionCreationLock(db, holdRefDirect, Timestamp, "redirect");
    if (lockResult.kind === "hold_inactive") {
      const rbInactive = await rollbackCheckoutSession(
        db,
        holdId,
        holdPayload as import("@/lib/booking/checkout-session-helpers").HoldLike,
        { FieldValue, Timestamp }
      );
      if (!rbInactive.ok) {
        await writeOperationalAlert({
          type: "rollback_checkout_session_failed",
          holdId,
          source: "create-checkout-session-direct",
          error: rbInactive.error instanceof Error ? rbInactive.error.message : String(rbInactive.error),
        });
      }
      return NextResponse.json({ error: "Hold expired or unavailable" }, { status: 400 });
    }
    if (lockResult.kind === "conflict") {
      if (!rollbackHoldId) {
        await writeOperationalAlert({
          type: "checkout_direct_lock_conflict_rollback_hold_id_undefined",
          holdId,
          source: "create-checkout-session-direct",
        });
      }
      const payloadForRollback = (rollbackHoldPayload ?? holdPayload) as import("@/lib/booking/checkout-session-helpers").HoldLike;
      if (!rollbackHoldPayload) {
        await writeOperationalAlert({
          type: "checkout_direct_lock_conflict_rollback_hold_payload_undefined",
          holdId,
          source: "create-checkout-session-direct",
        });
      }
      if (payloadForRollback) {
        const rbConflict = await rollbackCheckoutSession(db, holdId, payloadForRollback, { FieldValue, Timestamp });
        if (!rbConflict.ok) {
          await writeOperationalAlert({
            type: "rollback_checkout_session_failed",
            holdId,
            source: "create-checkout-session-direct",
            error: rbConflict.error instanceof Error ? rbConflict.error.message : String(rbConflict.error),
          });
        }
      } else {
        await writeOperationalAlert({
          type: "checkout_direct_lock_conflict_rollback_payload_missing",
          holdId,
          source: "create-checkout-session-direct",
        });
      }
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

    if (discountCents > 0 && discountCodeApplied && !stripeCouponId) {
      const coupon = await stripe.coupons.create(
        {
          amount_off: discountCents,
          currency: pricing.currency,
          name: `Discount (${discountCodeApplied})`,
          duration: "once",
        },
        { idempotencyKey: `coupon-cs-${holdId}-v${holdPaymentAttemptVersionForCoupon}` }
      );
      stripeCouponId = coupon.id;
    }

    let successUrlForSession = `${baseUrl}/booking/success?session_id={CHECKOUT_SESSION_ID}&receipt_token=${encodeURIComponent(receiptClaimToken ?? "")}`;
    let cancelUrlForSession = releaseToken
      ? `${baseUrl}/booking/cancel?holdId=${encodeURIComponent(holdId)}&release_token=${encodeURIComponent(releaseToken)}`
      : `${baseUrl}/booking/cancel?holdId=${encodeURIComponent(holdId)}`;
    const holdSnapExtend = await holdRefDirect.get();
    if (holdSnapExtend.exists) {
      const hEx = holdSnapExtend.data() as import("@/lib/booking/types").Hold;
      const createdAtTs = hEx.createdAt as unknown as { toMillis?: () => number } | undefined;
      if (createdAtTs && typeof createdAtTs.toMillis === "function") {
        const currentExp = (hEx.expiresAt as { toDate(): Date }).toDate();
        const capAt = new Date(createdAtTs.toMillis() + MAX_HOLD_LIFETIME_FROM_CREATED_MS);
        const proposed = new Date(Date.now() + HOLD_CHECKOUT_SESSION_EXTENSION_MINUTES * 60 * 1000);
        const newExp = proposed.getTime() > capAt.getTime() ? capAt : proposed;
        if (newExp.getTime() > currentExp.getTime()) {
          await holdRefDirect.update({
            expiresAt: Timestamp.fromDate(newExp),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        const urlExp = newExp.getTime() > currentExp.getTime() ? newExp : currentExp;
        const rtExtended = signReleaseToken(holdId, Math.floor(urlExp.getTime() / 1000));
        cancelUrlForSession = rtExtended
          ? `${baseUrl}/booking/cancel?holdId=${encodeURIComponent(holdId)}&release_token=${encodeURIComponent(rtExtended)}`
          : `${baseUrl}/booking/cancel?holdId=${encodeURIComponent(holdId)}`;
      }
    }

    const sessionParamsDirect: import("stripe").Stripe.Checkout.SessionCreateParams = {
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
      success_url: successUrlForSession,
      cancel_url: cancelUrlForSession,
    };
    const holdUpdateBaseDirect: Record<string, unknown> = {
      checkoutSessionMode: "redirect" as const,
      rollbackPending: FieldValue.delete(),
    };
    if (stripeCouponId) holdUpdateBaseDirect.stripeCouponId = stripeCouponId;
    const discountAtomicPersistDirect =
      discountRef && discountCodeApplied && discountCents > 0
        ? {
            discountRef,
            pricingTotalCents: pricing.totalCents,
            expectedDiscountCents: discountCents,
            expectedCode: discountCodeApplied,
          }
        : null;
    const createdDirect = await createStripeCheckoutSessionForHold(
      stripe,
      db,
      holdRefDirect,
      holdId,
      sessionParamsDirect,
      buildCheckoutSessionIdempotencyKey({
        holdId,
        embedded: false,
        holdPaymentAttemptVersion: holdPaymentAttemptVersionForCoupon,
      }),
      holdUpdateBaseDirect,
      { FieldValue, Timestamp },
      discountAtomicPersistDirect
    );
    if (!createdDirect.ok) {
      if (stripeCouponId) {
        await cleanupOrphanedCoupon(stripe, stripeCouponId, holdRefDirect, FieldValue);
      }
      if (createdDirect.kind === "stripe_create_failed") {
        await clearSessionCreationInflight(holdRefDirect, FieldValue);
        const rbSess = await rollbackCheckoutSession(
          db,
          holdId,
          holdPayload as import("@/lib/booking/checkout-session-helpers").HoldLike,
          { FieldValue, Timestamp }
        );
        if (!rbSess.ok) {
          await writeOperationalAlert({
            type: "rollback_checkout_session_failed",
            holdId,
            source: "create-checkout-session-direct",
            error: rbSess.error instanceof Error ? rbSess.error.message : String(rbSess.error),
          });
        }
        throw createdDirect.stripeError ?? new Error("Checkout session create failed");
      }
      if (createdDirect.kind === "persist_failed") {
        if (createdDirect.persistReason === "lost_race") {
          return NextResponse.json(
            { error: "Checkout session is being created; please retry in a moment." },
            { status: 409 }
          );
        }
        if (createdDirect.persistReason === "hold_inactive") {
          return NextResponse.json({ error: "Hold expired or unavailable" }, { status: 400 });
        }
        if (createdDirect.persistReason === "discount_invalid") {
          if (createdDirect.sessionId) {
            try {
              await stripe.checkout.sessions.expire(createdDirect.sessionId);
            } catch (ex) {
              console.error(
                "[create-checkout-session-direct] expire session after discount persist failed",
                createdDirect.sessionId,
                ex
              );
            }
          }
          if (stripeCouponId) {
            await cleanupOrphanedCoupon(stripe, stripeCouponId, holdRefDirect, FieldValue);
          }
          await clearSessionCreationInflight(holdRefDirect, FieldValue);
          const rbDisc = await rollbackCheckoutSession(
            db,
            holdId,
            holdPayload as import("@/lib/booking/checkout-session-helpers").HoldLike,
            { FieldValue, Timestamp }
          );
          if (!rbDisc.ok) {
            await writeOperationalAlert({
              type: "rollback_checkout_session_failed",
              holdId,
              source: "create-checkout-session-direct",
              error: rbDisc.error instanceof Error ? rbDisc.error.message : String(rbDisc.error),
            });
          }
          const msg = createdDirect.discountMessage ?? "Checkout is temporarily unavailable. Please try again.";
          const client400 =
            msg === "Discount changed while booking; please try again" ||
            msg === "This code has reached its usage limit" ||
            /^Invalid or expired code$/.test(msg) ||
            /^This code is no longer active$/.test(msg) ||
            /^This code has expired$/.test(msg) ||
            /^No amount to discount$/.test(msg) ||
            /^Invalid discount configuration$/.test(msg) ||
            /^No discount applies to this amount$/.test(msg);
          return NextResponse.json({ error: msg }, { status: client400 ? 400 : 500 });
        }
      }
      await clearSessionCreationInflight(holdRefDirect, FieldValue);
      const rbPersist = await rollbackCheckoutSession(
        db,
        holdId,
        holdPayload as import("@/lib/booking/checkout-session-helpers").HoldLike,
        { FieldValue, Timestamp }
      );
      if (!rbPersist.ok) {
        await writeOperationalAlert({
          type: "rollback_checkout_session_failed",
          holdId,
          source: "create-checkout-session-direct",
          error: rbPersist.error instanceof Error ? rbPersist.error.message : String(rbPersist.error),
        });
      }
      return NextResponse.json(
        { error: "Checkout is temporarily unavailable. Please try again." },
        { status: 500 }
      );
    }
    const session = createdDirect.session;
    if (session.url) {
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
    if (err instanceof LegacyScanLimitReachedError) {
      return NextResponse.json(
        {
          error: "Availability verification is temporarily degraded. Please try again in a moment.",
          code: "legacy_scan_limit_reached",
        },
        { status: 503 }
      );
    }
    if (err instanceof SlotConflictError || message === "Slot no longer available" || message === "This slot is blocked") {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (rollbackHoldId != null && rollbackHoldPayload != null) {
      try {
        const dbRollback = getDb();
        const { FieldValue: FV, Timestamp: Ts } = getFirestoreExports();
        const rbOuter = await rollbackCheckoutSession(
          dbRollback,
          rollbackHoldId,
          rollbackHoldPayload as import("@/lib/booking/checkout-session-helpers").HoldLike,
          { FieldValue: FV, Timestamp: Ts }
        );
        if (!rbOuter.ok) {
          await writeOperationalAlert({
            type: "rollback_checkout_session_failed",
            holdId: rollbackHoldId,
            source: "create-checkout-session-direct",
            error: rbOuter.error instanceof Error ? rbOuter.error.message : String(rbOuter.error),
          });
        }
      } catch (rollbackErr) {
        console.error("[create-checkout-session-direct] rollback after error failed", rollbackErr);
      }
    } else if (rollbackHoldId != null || rollbackHoldPayload != null) {
      void writeOperationalAlert({
        type: "checkout_direct_outer_rollback_partial_context",
        hasRollbackHoldId: rollbackHoldId != null,
        hasRollbackHoldPayload: rollbackHoldPayload != null,
        source: "create-checkout-session-direct",
      });
    }
    console.error("[create-checkout-session-direct]", err);
    if (err instanceof Error) {
      const m = err.message;
      if (
        m === "Discount changed while booking; please try again" ||
        m === "This code has reached its usage limit" ||
        /^Invalid or expired code$/.test(m) ||
        /^This code is no longer active$/.test(m) ||
        /^This code has expired$/.test(m) ||
        /^No amount to discount$/.test(m) ||
        /^Invalid discount configuration$/.test(m) ||
        /^No discount applies to this amount$/.test(m)
      ) {
        return NextResponse.json({ error: m }, { status: 400 });
      }
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
