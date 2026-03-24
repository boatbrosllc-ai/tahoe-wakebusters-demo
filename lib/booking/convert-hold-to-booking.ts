/**
 * Converts a paid hold into a booking in Firestore and sends confirmation email.
 * Used by: Stripe webhook (payment_intent.succeeded) and complete-after-payment API (client-triggered).
 * Idempotent: if hold is already converted, returns { alreadyConverted: true } and does nothing.
 * Supports full payment (legacy) or deposit-only (50/50) via paymentStage.
 */

import type { Firestore, DocumentReference } from "firebase-admin/firestore";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import { upsertBrevoContact, sendWaiverTemplateMissingAlert } from "@/lib/booking/brevo";
import { createWaiverForBooking, sendWaiverInviteAndMarkSent } from "@/lib/waiver/on-booking-created";
import {
  listTemplates,
  createWaiverRequestAndTokenInTransaction,
  createGroupTokenInTransaction,
} from "@/lib/waiver/firestore";
import { buildAddonSelectionsForPricing, computePricing, getEffectiveBoatRatePriceCents, getEffectiveRatePriceCents } from "@/lib/booking/pricing";
import { bookingEnv } from "@/lib/booking/env";
import { getSlotStartEnd, parseSlotId, parseSlotIdRelaxed } from "@/lib/booking/experience-slots";
import { hasOverlappingBlock } from "@/lib/booking/has-overlapping-block";
import { departureTimesMatch } from "@/lib/booking/departure-match";
import { DEFAULT_CANCELLATION_POLICY } from "@/lib/booking/cancellation-policy";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { getDepartureInventoryRef, checkCapacityAndRelease } from "@/lib/booking/shared-departure-inventory";
import {
  addConfirmationOutboxInTransaction,
  addWaiverInviteOutboxInTransaction,
  tryImmediateConfirmationSendForBooking,
  tryImmediateWaiverInviteSendForBooking,
} from "@/lib/booking/notification-outbox";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import type { Booking, Hold, Slot, Boat, Rate, Addon, FirestoreTimestamp, BookingCardDisplay, BookingPricing } from "@/lib/booking/types";
import { bookingLog, bookingWarn, bookingError } from "@/lib/booking/debug";
import type { Experience, ExperienceRate, ExperienceAddon, BoatRate, ListingBoat } from "@/lib/booking/types";
import { upsertPendingRefundRecord } from "@/lib/booking/pending-refund-idempotent";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { fetchMergedPricingCalendarRatesForBoatTypes } from "@/lib/booking/pricing-calendar-fetch";
import { DEPOSIT_FRACTION } from "@/lib/booking/constants";
import { HOLD_EXPIRY_GRACE_AFTER_PAYMENT_MS } from "@/lib/booking/hold-expiry";
import { computeFinalChargeTotalCentsFromHoldPricing } from "@/lib/booking/hold-pricing-final-total";
import { getStripe } from "@/lib/booking/stripe-client";
import { computeFinalChargeAtUtc } from "@/lib/booking/final-charge-at";

/** Legacy: full payment in one charge. */
export interface ConvertHoldInputFull {
  paymentStage?: "full";
  paymentIntentId: string;
  amountTotalCents?: number;
  currency?: string;
  /** When provided (e.g. from Stripe Checkout session), overrides hold.customerDraft. */
  customerOverride?: { name: string; email: string; phone: string };
  /** When provided (e.g. from Checkout custom field), overrides hold.answers?.comments. */
  specialNotesOverride?: string;
  /** Optional Stripe Checkout Session ID to store on the booking. */
  checkoutSessionId?: string;
}

/** 50/50: deposit paid; booking created with final_due and finalChargeAt. */
export interface ConvertHoldInputDeposit {
  paymentStage: "deposit";
  paymentIntentId: string;
  amountTotalCents?: number;
  currency?: string;
  /** When PI/webhook arrives before Checkout collects email (e.g. direct checkout placeholder hold). */
  customerOverride?: { name: string; email: string; phone: string };
  stripe: {
    /** Optional: when set, we can charge remaining balance off-session later. Missing customerId is an ops follow-up (e.g. link customer later); do not coerce to full-payment. */
    customerId?: string;
    paymentMethodId?: string;
    card?: BookingCardDisplay;
    totalCents: number;
    depositCents: number;
    finalCents: number;
  };
}

export type ConvertHoldInput = ConvertHoldInputFull | ConvertHoldInputDeposit;

export type ConvertHoldResult =
  | { bookingId: string }
  | { alreadyConverted: true }
  /** Charged amount does not match recomputed hold pricing — booking not created; caller should refund + alert. */
  | { amountIntegrityMismatch: true };

export function isConvertHoldInputDeposit(input: ConvertHoldInput): input is ConvertHoldInputDeposit {
  return input.paymentStage === "deposit";
}

/** Thrown when admin blocks overlap the hold slot — payment succeeded but booking must not be created. */
export const BOOKING_BLOCKED_BY_OPERATOR_MESSAGE =
  "Booking cannot be completed: this date has been blocked by the operator";

export function isBookingBlockedByOperatorError(err: unknown): boolean {
  return err instanceof Error && err.message === BOOKING_BLOCKED_BY_OPERATOR_MESSAGE;
}

export async function convertHoldToBooking(
  db: Firestore,
  holdId: string,
  input: ConvertHoldInput
): Promise<ConvertHoldResult> {
  const isDeposit = isConvertHoldInputDeposit(input);
  bookingLog("convert-hold", "convertHoldToBooking started", {
    holdId,
    paymentStage: isDeposit ? "deposit" : "full",
    paymentIntentIdPrefix: input.paymentIntentId?.slice(0, 24) + "...",
  });
  const { FieldValue, Timestamp } = getFirestoreExports();
  const holdRef = db.collection("holds").doc(holdId);
  const holdSnap = await holdRef.get();
  if (!holdSnap.exists) {
    bookingError("convert-hold", "hold not found", null, { holdId });
    throw new Error("Hold not found");
  }
  const hold = holdSnap.data() as Hold;
  const expiresAtDate = (hold.expiresAt as { toDate(): Date }).toDate();

  let graceVerifiedForConversion = false;
  const piIdForGrace = typeof input.paymentIntentId === "string" ? input.paymentIntentId.trim() : "";
  if (piIdForGrace) {
    const ageMs = Date.now() - expiresAtDate.getTime();
    if (ageMs > 0 && ageMs <= HOLD_EXPIRY_GRACE_AFTER_PAYMENT_MS) {
      try {
        const piGrace = await getStripe().paymentIntents.retrieve(piIdForGrace);
        graceVerifiedForConversion = piGrace.status === "succeeded";
        if (graceVerifiedForConversion) {
          bookingLog("convert-hold", "hold past expiresAt but PI succeeded within grace — allowing conversion", {
            holdId,
            ageMs,
          });
        }
      } catch (graceErr) {
        bookingWarn("convert-hold", "grace window PI verify failed", { holdId, err: graceErr });
      }
    }
  }

  if (hold.status !== "active") {
    if (hold.status === "converted") {
      let bookingForSideEffects: Booking | null = null;
      const recoveryBookingId = hold.bookingId;
      if (recoveryBookingId) {
        const bSnap = await db.collection("bookings").doc(recoveryBookingId).get();
        if (bSnap.exists) bookingForSideEffects = bSnap.data() as Booking;
      }
      // When the hold is already converted, check whether the incoming payment intent matches
      // the one that was recorded during payment creation. A mismatch means a second charge
      // arrived for the same hold (e.g. two browser tabs, a webhook retry of a different PI).
      // Flag it for the refund workflow rather than silently ignoring it.
      if (input.paymentIntentId) {
        const isDepositPath = isConvertHoldInputDeposit(input);
        const holdPiField = isDepositPath ? "depositPaymentIntentId" : "fullPaymentIntentId";
        const recordedPiId = (hold as unknown as Record<string, unknown>)[holdPiField] as string | undefined;
        const isKnownFinalPi =
          bookingForSideEffects?.stripe?.finalPaymentIntentId != null &&
          bookingForSideEffects.stripe.finalPaymentIntentId === input.paymentIntentId;
        if (!isKnownFinalPi && input.paymentIntentId !== recordedPiId) {
          try {
            const customerEmail = hold.customerDraft?.email;
            await upsertPendingRefundRecord(
              db,
              {
                reason: "duplicate_charge_after_conversion",
                holdId,
                paymentIntentId: input.paymentIntentId,
                duplicatePaymentIntentId: input.paymentIntentId,
                expectedPaymentIntentId: recordedPiId ?? null,
              },
              {
                holdId,
                duplicatePaymentIntentId: input.paymentIntentId,
                expectedPaymentIntentId: recordedPiId ?? null,
                ...(customerEmail && { customerEmail }),
              }
            );
            await writeOperationalAlert({
              type: "duplicate_charge_after_conversion",
              holdId,
              bookingId: recoveryBookingId,
              paymentIntentId: input.paymentIntentId,
              expectedPaymentIntentId: recordedPiId ?? undefined,
              source: "convert-hold-to-booking",
            });
            console.warn("[convert-hold-to-booking] Duplicate charge flagged for refund", {
              holdId,
              duplicatePaymentIntentId: input.paymentIntentId,
              expectedPaymentIntentId: recordedPiId ?? null,
            });
          } catch (refundFlagErr) {
            console.error("[convert-hold-to-booking] Failed to write pendingRefunds record", refundFlagErr);
          }
        }
      }
      if (bookingForSideEffects && recoveryBookingId) {
        if (!bookingForSideEffects.waiver) {
          const cust = bookingForSideEffects.customer;
          const waiverResult = await createWaiverForBooking({
            bookingId: recoveryBookingId,
            customerEmail: cust.email,
            customerName: cust.name,
          });
          if (waiverResult?.sendSeparateWaiverInvite) {
            try {
              await sendWaiverInviteAndMarkSent(waiverResult);
            } catch (waiverErr) {
              bookingError("convert-hold", "recovery waiver invite send failed", waiverErr, { bookingId: recoveryBookingId });
            }
          }
        }
        if (hold.marketingOptIn && !bookingForSideEffects.brevoSubscribedAt) {
          const listId = bookingEnv.brevoMarketingListId;
          try {
            const cust = bookingForSideEffects.customer;
            await upsertBrevoContact(cust.email, cust.name, cust.phone, listId ?? undefined);
            await db.collection("bookings").doc(recoveryBookingId).update({
              brevoSubscribedAt: Timestamp.now(),
              updatedAt: FieldValue.serverTimestamp(),
            });
          } catch (listErr) {
            bookingError("convert-hold", "recovery Brevo list subscribe failed", listErr, { bookingId: recoveryBookingId });
          }
        }
      }
      bookingLog("convert-hold", "hold already converted, returning idempotent", { holdId, status: hold.status });
      return { alreadyConverted: true };
    }
    if (hold.status === "expired") {
      if (!graceVerifiedForConversion) {
        bookingLog("convert-hold", "hold status expired", { holdId });
        throw new Error("Hold has expired");
      }
    } else if (hold.status !== "expired") {
      bookingError("convert-hold", "unexpected hold status", null, { holdId, status: hold.status });
      throw new Error(`Unexpected hold status: ${hold.status}`);
    }
  }
  if (expiresAtDate < new Date() && !graceVerifiedForConversion) {
    bookingLog("convert-hold", "hold expired", { holdId, expiresAt: expiresAtDate.toISOString() });
    throw new Error("Hold has expired");
  }

  const isSharedHold = (hold as { bookingMode?: string }).bookingMode === "shared";
  const hasExperience = !!hold.experienceId;
  const hasBoat = !!hold.boatId;
  const isListingBoatFlow = hasExperience && hasBoat;
  bookingLog("convert-hold", "hold valid, resolving flow", {
    holdId,
    isSharedHold,
    isListingBoatFlow,
    hasExperience,
    hasBoat,
  });
  let slotRef: DocumentReference | null;
  let experienceName: string;
  let boatNameForEmail: string;
  let locationText: string;
  let cancellationPolicyText: string;
  let rate: Rate | ExperienceRate | BoatRate;
  let slot: Slot;
  let experienceForPricing: Experience | null = null;
  let boatForPricing: ListingBoat | null = null;

  // Kick off addons fetch in parallel — only depends on hold IDs known upfront
  const addonsPromise = (hasExperience
    ? db.collection("experiences").doc(hold.experienceId!).collection("addons")
    : db.collection("boats").doc(hold.boatId!).collection("addons")
  ).get();

  if (isListingBoatFlow) {
    const [expSnap, boatSnap, rateSnap, slotSnapMaybe] = await Promise.all([
      db.collection("experiences").doc(hold.experienceId!).get(),
      db.collection("boats").doc(hold.boatId!).get(),
      db.collection("experiences").doc(hold.experienceId!).collection("rates").doc(hold.rateId).get(),
      isSharedHold ? Promise.resolve(null) : db.collection("boats").doc(hold.boatId!).collection("slots").doc(hold.slotId).get(),
    ]);
    if (!isSharedHold) {
      const slotSnap = slotSnapMaybe!;
      if (!expSnap.exists || !boatSnap.exists || !rateSnap.exists || !slotSnap.exists) {
        throw new Error("Experience/boat/rate/slot not found");
      }
      const exp = expSnap.data() as Experience;
      experienceForPricing = exp;
      boatForPricing = boatSnap.data() as ListingBoat;
      const boat = boatForPricing as { name?: string };
      experienceName = exp.title;
      boatNameForEmail = boat.name ?? exp.title;
      locationText = exp.location?.addressText ?? "We'll send exact meeting point after booking.";
      cancellationPolicyText = exp.cancellationPolicy?.fullText ?? DEFAULT_CANCELLATION_POLICY;
      rate = rateSnap.data() as ExperienceRate;
      slot = slotSnap.data() as Slot;
      if (slot.holdId !== holdId) throw new Error("Slot not held by this hold");
      slotRef = db.collection("boats").doc(hold.boatId!).collection("slots").doc(hold.slotId);
    } else {
      if (!expSnap.exists || !boatSnap.exists || !rateSnap.exists) {
        throw new Error("Experience/boat/rate not found");
      }
      const exp = expSnap.data() as Experience;
      experienceForPricing = exp;
      boatForPricing = boatSnap.data() as ListingBoat;
      const boat = boatForPricing as { name?: string };
      experienceName = exp.title;
      boatNameForEmail = boat.name ?? exp.title;
      locationText = exp.location?.addressText ?? "We'll send exact meeting point after booking.";
      cancellationPolicyText = exp.cancellationPolicy?.fullText ?? DEFAULT_CANCELLATION_POLICY;
      rate = rateSnap.data() as ExperienceRate;
      const parsedShared = parseSlotId(hold.slotId);
      if (!parsedShared) throw new Error("Invalid slot");
      const { start: sharedStart, end: sharedEnd } = getSlotStartEnd(parsedShared.dateStr, parsedShared.startHour, parsedShared.durationHours, parsedShared.startMinute ?? 0);
      slot = {
        startAt: { seconds: 0, nanoseconds: 0, toDate: () => sharedStart },
        endAt: { seconds: 0, nanoseconds: 0, toDate: () => sharedEnd },
        status: "booked",
        holdId: null,
        bookingId: null,
        updatedAt: { seconds: 0, nanoseconds: 0 },
      };
      slotRef = null;
    }
  } else if (hasExperience) {
    const [expSnap, rateSnap, slotSnapMaybe] = await Promise.all([
      db.collection("experiences").doc(hold.experienceId!).get(),
      db.collection("experiences").doc(hold.experienceId!).collection("rates").doc(hold.rateId).get(),
      isSharedHold ? Promise.resolve(null) : db.collection("experiences").doc(hold.experienceId!).collection("slots").doc(hold.slotId).get(),
    ]);
    if (!isSharedHold) {
      const slotSnap = slotSnapMaybe!;
      if (!expSnap.exists || !rateSnap.exists || !slotSnap.exists) {
        throw new Error("Experience/rate/slot not found");
      }
      const exp = expSnap.data() as Experience;
      experienceForPricing = exp;
      experienceName = exp.title;
      boatNameForEmail = exp.title;
      locationText = exp.location?.addressText ?? "We'll send exact meeting point after booking.";
      cancellationPolicyText = exp.cancellationPolicy?.fullText ?? DEFAULT_CANCELLATION_POLICY;
      rate = rateSnap.data() as ExperienceRate;
      slot = slotSnap.data() as Slot;
      if (slot.holdId !== holdId) throw new Error("Slot not held by this hold");
      slotRef = db.collection("experiences").doc(hold.experienceId!).collection("slots").doc(hold.slotId);
    } else {
      if (!expSnap.exists || !rateSnap.exists) {
        throw new Error("Experience/rate not found");
      }
      const exp = expSnap.data() as Experience;
      experienceForPricing = exp;
      experienceName = exp.title;
      boatNameForEmail = exp.title;
      locationText = exp.location?.addressText ?? "We'll send exact meeting point after booking.";
      cancellationPolicyText = exp.cancellationPolicy?.fullText ?? DEFAULT_CANCELLATION_POLICY;
      rate = rateSnap.data() as ExperienceRate;
      const parsedShared = parseSlotId(hold.slotId);
      if (!parsedShared) throw new Error("Invalid slot");
      const { start: sharedStart, end: sharedEnd } = getSlotStartEnd(parsedShared.dateStr, parsedShared.startHour, parsedShared.durationHours, parsedShared.startMinute ?? 0);
      slot = {
        startAt: { seconds: 0, nanoseconds: 0, toDate: () => sharedStart },
        endAt: { seconds: 0, nanoseconds: 0, toDate: () => sharedEnd },
        status: "booked",
        holdId: null,
        bookingId: null,
        updatedAt: { seconds: 0, nanoseconds: 0 },
      };
      slotRef = null;
    }
  } else {
    const [boatSnap, rateSnap, slotSnap] = await Promise.all([
      db.collection("boats").doc(hold.boatId!).get(),
      db.collection("boats").doc(hold.boatId!).collection("rates").doc(hold.rateId).get(),
      db.collection("boats").doc(hold.boatId!).collection("slots").doc(hold.slotId).get(),
    ]);
    if (!boatSnap.exists || !rateSnap.exists || !slotSnap.exists) {
      throw new Error("Boat/rate/slot not found");
    }
    const boat = boatSnap.data() as Boat;
    experienceName = boat.name;
    boatNameForEmail = boat.name;
    locationText = boat.defaultLocationText ?? "We'll send exact meeting point after booking.";
    cancellationPolicyText = boat.cancellationPolicyText ?? DEFAULT_CANCELLATION_POLICY;
    rate = rateSnap.data() as Rate;
    slot = slotSnap.data() as Slot;
    if (slot.holdId !== holdId) throw new Error("Slot not held by this hold");
    slotRef = db.collection("boats").doc(hold.boatId!).collection("slots").doc(hold.slotId);
  }

  const calendarRatesPromise =
    isListingBoatFlow && boatForPricing && typeof boatForPricing.boatType === "string" && boatForPricing.boatType.trim()
      ? fetchMergedPricingCalendarRatesForBoatTypes(db, [boatForPricing.boatType.trim()])
      : Promise.resolve(undefined as Record<string, number> | undefined);
  const [addonsSnap, calendarRates] = await Promise.all([addonsPromise, calendarRatesPromise]);
  const addonsById = new Map<string, Addon | ExperienceAddon>();
  addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as Addon | ExperienceAddon));
  const addonsForPricing = buildAddonSelectionsForPricing(hold.addonSelections, addonsById);
  let pricing: BookingPricing;
  if (hold.pricing) {
    pricing = hold.pricing;
  } else {
    console.warn("[convert-hold-to-booking] hold.pricing missing, recomputing", holdId);
    let rateForPricing: Rate | ExperienceRate | BoatRate = rate;
    if (hasExperience && experienceForPricing && slot?.startAt && "priceCents" in rate) {
      const slotStart = (slot.startAt as { toDate(): Date }).toDate();
      if (isListingBoatFlow && boatForPricing) {
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
            experienceForPricing.holidayDates,
            boatForPricing.priceOverrides,
            calendarRates,
            experienceForPricing.weekendDays,
            experienceForPricing.friSunDays
          ),
        };
      } else {
        rateForPricing = {
          ...rate,
          priceCents: getEffectiveRatePriceCents(
            rate as { priceCents: number; priceWeekendCents?: number; priceFriSunCents?: number; priceHolidayCents?: number; durationHours?: number },
            slotStart,
            experienceForPricing.holidayDates,
            experienceForPricing.weekendDays,
            experienceForPricing.friSunDays
          ),
        };
      }
    }
    // Ticketed (shared) experiences: price is per ticket, so multiply by partySize.
    const ticketQty = isSharedHold && (experienceForPricing as Experience)?.pricingType === "ticketed"
      ? Math.max(1, Math.floor(Number(hold.partySize ?? 1)))
      : 1;
    pricing = computePricing({ rate: rateForPricing, addons: addonsForPricing, currency: "usd", qty: ticketQty });
  }
  const holdTipCents = (hold as { tipCents?: number }).tipCents ?? 0;
  const holdDiscountCents = (hold as { discountCents?: number }).discountCents ?? 0;
  const finalPricing = {
    ...pricing,
    totalCents: computeFinalChargeTotalCentsFromHoldPricing(pricing, holdTipCents, holdDiscountCents),
  };
  /** Must match create-payment-intent deposit math (`DEPOSIT_FRACTION` in lib/booking/constants). */
  const expectedChargeCents = isDeposit ? Math.round(finalPricing.totalCents * DEPOSIT_FRACTION) : finalPricing.totalCents;
  const chargedFromInput =
    typeof input.amountTotalCents === "number" && Number.isFinite(input.amountTotalCents)
      ? Math.round(input.amountTotalCents)
      : null;
  if (chargedFromInput != null && Math.abs(chargedFromInput - expectedChargeCents) > 1) {
    bookingWarn("convert-hold", "amount integrity mismatch vs hold pricing — blocking conversion", {
      holdId,
      expectedChargeCents,
      chargedFromInput,
      paymentStage: isDeposit ? "deposit" : "full",
    });
    try {
      await upsertPendingRefundRecord(
        db,
        {
          reason: "amount_integrity_mismatch",
          holdId,
          paymentIntentId: input.paymentIntentId,
        },
        {
          holdId,
          paymentIntentId: input.paymentIntentId,
          expectedChargeCents,
          chargedFromInput,
          finalPricingTotalCents: finalPricing.totalCents,
          requiresReview: chargedFromInput > expectedChargeCents,
          ...(hold.customerDraft?.email && { customerEmail: hold.customerDraft.email }),
        }
      );
      await writeOperationalAlert({
        type: "convert_hold_amount_integrity_mismatch",
        holdId,
        paymentIntentId: input.paymentIntentId,
        expectedChargeCents,
        chargedFromInput,
        source: "convert-hold-to-booking",
      });
    } catch (e) {
      bookingError("convert-hold", "failed to record pending refund for amount mismatch", e, { holdId });
    }
    return { amountIntegrityMismatch: true };
  }

  if (hold.experienceId) {
    const parsedForBlock = parseSlotIdRelaxed(hold.slotId) ?? parseSlotId(hold.slotId);
    if (parsedForBlock) {
      const { start: slotStartBlock, end: slotEndBlock } = getSlotStartEnd(
        parsedForBlock.dateStr,
        parsedForBlock.startHour,
        parsedForBlock.durationHours,
        parsedForBlock.startMinute ?? 0
      );
      const expSlugBlock =
        experienceForPricing && typeof (experienceForPricing as Experience).slug === "string"
          ? (experienceForPricing as Experience).slug.trim()
          : "";
      const expVariantsBlock = getExperienceIdVariants(hold.experienceId, expSlugBlock);
      const blocked = await hasOverlappingBlock({
        db,
        Timestamp,
        experienceId: hold.experienceId,
        experienceIdVariants: expVariantsBlock,
        boatId: hold.boatId,
        slotStart: slotStartBlock,
        slotEnd: slotEndBlock,
      });
      if (blocked) {
        throw new Error(BOOKING_BLOCKED_BY_OPERATOR_MESSAGE);
      }
    }
  }

  const fullInput = input as ConvertHoldInputFull;
  const customer = (isDeposit ? input.customerOverride : fullInput.customerOverride) ?? hold.customerDraft;
  const specialNotes = fullInput.specialNotesOverride ?? (hold.answers?.comments?.trim() || undefined);
  const bookingId = db.collection("bookings").doc().id;
  const parsedSlot = parseSlotId(hold.slotId);
  const startDateStrFallback = hold.slotId.length >= 10 ? hold.slotId.slice(0, 10) : null;
  if (!parsedSlot) {
    bookingWarn("convert-hold", "slotId failed to parse; using date fallback for startDateStr", { holdId, slotId: hold.slotId });
    if (!startDateStrFallback || !/^\d{4}-\d{2}-\d{2}$/.test(startDateStrFallback)) {
      bookingError("convert-hold", "slotId unparseable and no valid date prefix; cannot create booking", null, { holdId, slotId: hold.slotId });
      throw new Error("Invalid slot: cannot determine trip date");
    }
  }
  const holdDiscountCode = (hold as { discountCode?: string }).discountCode;

  const parsedSlotForFinal = parseSlotId(hold.slotId);
  if (!parsedSlotForFinal) {
    bookingError("convert-hold", "cannot compute finalChargeAt: invalid hold.slotId", null, { holdId, slotId: hold.slotId });
    throw new Error("Invalid slot: cannot determine final charge time");
  }
  const slotStartFromHoldId = getSlotStartEnd(
    parsedSlotForFinal.dateStr,
    parsedSlotForFinal.startHour,
    parsedSlotForFinal.durationHours,
    parsedSlotForFinal.startMinute ?? 0
  ).start;
  const finalChargeAtDate = computeFinalChargeAtUtc(slotStartFromHoldId);
  const finalChargeAtTimestamp = Timestamp.fromDate(finalChargeAtDate);

  /** Canonical booking value: always store totalAmountCents = finalPricing.totalCents so revenue summary increment (here) and decrement (admin cancel) use the same field and stay in sync. */
  if (isDeposit && (typeof input.stripe.depositCents !== "number" || !Number.isFinite(input.stripe.depositCents))) {
    bookingError("convert-hold", "deposit conversion missing stripe.depositCents — cannot record booking", null, { holdId });
    throw new Error("Deposit conversion missing deposit amount");
  }

  const stripeBlock: Booking["stripe"] = isDeposit
    ? {
        depositPaymentIntentId: input.paymentIntentId,
        ...(input.stripe.customerId && { customerId: input.stripe.customerId }),
        ...(input.stripe.paymentMethodId && { paymentMethodId: input.stripe.paymentMethodId }),
        depositAmountCents: input.stripe.depositCents,
        finalAmountCents: input.stripe.finalCents,
        totalAmountCents: finalPricing.totalCents,
        depositPaidAt: Timestamp.now(),
        ...(input.amountTotalCents != null && { amountTotalCents: input.amountTotalCents }),
        ...(input.currency && { currency: input.currency }),
      }
    : {
        paymentIntentId: input.paymentIntentId,
        totalAmountCents: finalPricing.totalCents,
        ...(input.amountTotalCents != null && { amountTotalCents: input.amountTotalCents }),
        ...(input.currency && { currency: input.currency }),
        ...(fullInput.checkoutSessionId && { checkoutSessionId: fullInput.checkoutSessionId }),
      };

  const booking: Omit<Booking, "createdAt"> & {
    createdAt: FirestoreTimestamp;
    summaryCountersApplied?: boolean;
  } = {
    ...(hold.experienceId ? { experienceId: hold.experienceId } : {}),
    ...(hold.boatId ? { boatId: hold.boatId } : {}),
    ...((hold as { bookingMode?: "shared" | "charter" }).bookingMode ? { bookingMode: (hold as { bookingMode?: "shared" | "charter" }).bookingMode } : {}),
    holdId,
    slotId: hold.slotId,
    startDateStr: parsedSlot ? parsedSlot.dateStr : startDateStrFallback ?? undefined,
    rateId: hold.rateId,
    addonSelections: hold.addonSelections,
    partySize: hold.partySize,
    petsCount: hold.petsCount,
    answers: hold.answers,
    customer,
    marketingOptIn: hold.marketingOptIn,
    ...(specialNotes ? { specialNotes } : {}),
    pricing: finalPricing,
    status: isDeposit ? "final_due" : "paid",
    stripe: stripeBlock,
    ...(holdDiscountCode && holdDiscountCents > 0 ? { discountCode: holdDiscountCode, discountCents: holdDiscountCents } : {}),
    ...(isDeposit ? { finalChargeAt: finalChargeAtTimestamp as unknown as FirestoreTimestamp } : {}),
    ...(isDeposit && input.stripe.card ? { card: input.stripe.card } : {}),
    createdAt: Timestamp.now() as unknown as FirestoreTimestamp,
    ...(finalPricing.totalCents > 0 ? { summaryCountersApplied: true as const } : {}),
  };

  if (parsedSlot) {
    const sds = booking.startDateStr;
    if (!sds || sds !== parsedSlot.dateStr) {
      bookingError("convert-hold", "invariant failed: parseable slotId must persist startDateStr", null, {
        holdId,
        slotId: hold.slotId,
        startDateStr: sds ?? null,
      });
      throw new Error("Invalid booking write: startDateStr required when slotId is parseable");
    }
  }

  /** Sentinel thrown when transactional re-read shows hold no longer active (idempotency gate). */
  const HOLD_NOT_ACTIVE_SENTINEL = new Error("HOLD_NOT_ACTIVE");

  const waiverTemplates = await listTemplates();
  const activeWaiverTemplate = waiverTemplates.find((t) => t.isActive);
  if (!activeWaiverTemplate && customer.email?.trim()) {
    const tripDate = booking.startDateStr ?? "";
    void sendWaiverTemplateMissingAlert(
      bookingId,
      { name: customer.name, email: customer.email, phone: customer.phone },
      tripDate
    );
  }

  let enqueueWaiverInviteOutbox = false;

  bookingLog("convert-hold", "starting transaction (slot update + booking doc + hold status)", { holdId, bookingId });
  try {
  await db.runTransaction(async (tx) => {
    const freshSnap = await tx.get(holdRef);
    if (!freshSnap.exists) throw HOLD_NOT_ACTIVE_SENTINEL;
    const freshHold = freshSnap.data() as Hold;
    if (freshHold.status === "converted") throw HOLD_NOT_ACTIVE_SENTINEL;
    const holdExpiresAt = freshHold.expiresAt as { toDate?: () => Date } | undefined;
    const holdExpiryDate = holdExpiresAt?.toDate?.();
    const expiredByClock = holdExpiryDate != null && holdExpiryDate.getTime() < Date.now();
    if (freshHold.status === "active") {
      if (expiredByClock && !graceVerifiedForConversion) throw HOLD_NOT_ACTIVE_SENTINEL;
    } else if (freshHold.status === "expired") {
      if (!graceVerifiedForConversion) throw HOLD_NOT_ACTIVE_SENTINEL;
    } else {
      throw HOLD_NOT_ACTIVE_SENTINEL;
    }

    let inventoryRefForShared: ReturnType<typeof getDepartureInventoryRef> | null = null;
    let preReadReservedSeats: number | undefined;
    if (isSharedHold && hold.experienceId && parsedSlot && experienceForPricing) {
      inventoryRefForShared = getDepartureInventoryRef(db, hold.experienceId, parsedSlot.dateStr);
      const invSnap = await tx.get(inventoryRefForShared);
      preReadReservedSeats = invSnap.exists ? ((invSnap.data() as { reservedSeats?: number }).reservedSeats ?? 0) : 0;
    }

    if (isSharedHold && hold.experienceId && parsedSlot && experienceForPricing && inventoryRefForShared != null) {
      const expSlugTx =
        typeof (experienceForPricing as Experience).slug === "string" ? (experienceForPricing as Experience).slug.trim() : "";
      const slugVariantsTx = getExperienceIdVariants(hold.experienceId, expSlugTx);
      const bookSnapsTx = await Promise.all(
        slugVariantsTx.map((v) =>
          tx.get(
            db
              .collection("bookings")
              .where("experienceId", "==", v)
              .where("startDateStr", "==", parsedSlot.dateStr)
          )
        )
      );
      const seenTx = new Set<string>();
      let sharedDepartureSold = 0;
      for (const snap of bookSnapsTx) {
        for (const doc of snap.docs) {
          if (seenTx.has(doc.id)) continue;
          seenTx.add(doc.id);
          const b = doc.data() as { partySize?: number; status?: string; bookingMode?: string; slotId?: string };
          if (typeof b.partySize !== "number") continue;
          if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
          if (b.bookingMode === "charter") {
            if (parsedSlot && departureTimesMatch(b.slotId, parsedSlot)) {
              throw new Error("This departure is reserved as a private charter");
            }
            continue;
          }
          sharedDepartureSold += b.partySize;
        }
      }
      const capacity =
        (experienceForPricing as Experience).maxCapacity ?? getMaxGuestsForExperience(experienceForPricing);
      await checkCapacityAndRelease(tx, inventoryRefForShared, capacity, sharedDepartureSold, hold.partySize, {
        preReadReservedSeats,
      });
    }
    if (!isSharedHold && slotRef && experienceForPricing?.pricingType === "ticketed" && parsedSlot && hold.experienceId) {
      const expSlugTx =
        typeof (experienceForPricing as Experience).slug === "string" ? (experienceForPricing as Experience).slug.trim() : "";
      const slugVariantsCharter = getExperienceIdVariants(hold.experienceId, expSlugTx);
      const sharedConflictSnaps = await Promise.all(
        slugVariantsCharter.map((v) =>
          tx.get(
            db
              .collection("bookings")
              .where("experienceId", "==", v)
              .where("startDateStr", "==", parsedSlot.dateStr)
          )
        )
      );
      for (const snap of sharedConflictSnaps) {
        for (const doc of snap.docs) {
          const b = doc.data() as { status?: string; bookingMode?: string; slotId?: string };
          if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
          if (b.bookingMode !== "shared") continue;
          if (departureTimesMatch(b.slotId, parsedSlot)) {
            throw new Error("Shared tickets have already been sold for this departure");
          }
        }
      }
    }
    if (!isSharedHold && slotRef) {
      const s = await tx.get(slotRef);
      if (!s.exists) throw new Error("Slot not found");
      const slotData = s.data() as Slot;
      if (slotData.holdId !== holdId) throw new Error("Slot not held by this hold");
      tx.update(slotRef, {
        status: "booked",
        bookingId,
        holdId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    let bookingDoc: typeof booking = booking;
    if (activeWaiverTemplate) {
      const { requestId } = createWaiverRequestAndTokenInTransaction(tx, db, {
        bookingId,
        templateId: activeWaiverTemplate.id,
        templateVersion: activeWaiverTemplate.version,
        signerEmail: customer.email.trim(),
      });
      if ((hold.partySize ?? 1) > 1) {
        createGroupTokenInTransaction(
          tx,
          db,
          bookingId,
          activeWaiverTemplate.id,
          activeWaiverTemplate.version,
          hold.partySize
        );
      }
      bookingDoc = {
        ...booking,
        waiver: {
          requestId,
          status: "pending",
          templateId: activeWaiverTemplate.id,
          templateVersion: activeWaiverTemplate.version,
        },
      };
      if (activeWaiverTemplate.sendSeparateWaiverInvite === true) {
        await addWaiverInviteOutboxInTransaction(tx, db, bookingId);
        enqueueWaiverInviteOutbox = true;
      }
    }
    tx.set(db.collection("bookings").doc(bookingId), bookingDoc);
    addConfirmationOutboxInTransaction(tx, db, bookingId);
    const holdUpdate: Record<string, unknown> = { status: "converted", bookingId };
    if (isDeposit) {
      holdUpdate.depositPaymentIntentId = input.paymentIntentId;
    } else {
      holdUpdate.fullPaymentIntentId = input.paymentIntentId;
    }
    tx.update(holdRef, holdUpdate);
    const revenueCents = isDeposit ? (input.stripe.depositCents ?? 0) : (finalPricing.totalCents ?? 0);
    if (revenueCents > 0) {
      const summaryRef = db.collection("summaries").doc("revenue");
      // customerCount: legacy field name — increments once per successful paid conversion (same semantics as
      // bookingCount / admin cancel decrement), not deduplicated unique emails. Consider a one-time Firestore
      // backfill: summaries/revenue.customerCount += N where N = net bookings that added revenue without increment.
      tx.set(summaryRef, {
        totalRevenueCents: FieldValue.increment(revenueCents),
        bookingCount: FieldValue.increment(1),
        customerCount: FieldValue.increment(1),
      }, { merge: true });
      // Revenue recognition: monthly summaries are keyed by payment date (creation date), not trip date.
      // Cancel route uses the same policy (booking.createdAt) for decrements. If trip-date attribution is
      // required, use parsedSlot.dateStr for monthKey and update cancel/route.ts to use startDateStr consistently.
      const now = new Date();
      const monthKey = `revenue_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, "0")}`;
      const monthRef = db.collection("summaries").doc(monthKey);
      tx.set(monthRef, {
        revenueCents: FieldValue.increment(revenueCents),
        bookingCount: FieldValue.increment(1),
      }, { merge: true });
    }
  });
  } catch (err) {
    if (err === HOLD_NOT_ACTIVE_SENTINEL) {
      const afterSnap = await holdRef.get();
      if (!afterSnap.exists) {
        bookingError("convert-hold", "hold missing after transaction conflict", null, { holdId });
        throw new Error("Hold not found");
      }
      const afterHold = afterSnap.data() as Hold;
      if (afterHold.status === "converted") {
        bookingLog("convert-hold", "hold no longer active (transactional read), returning idempotent", { holdId });
        return { alreadyConverted: true };
      }
      if (afterHold.status === "expired") {
        bookingLog("convert-hold", "hold expired (transactional read)", { holdId });
        throw new Error("Hold has expired");
      }
      bookingError("convert-hold", "unexpected hold status after transaction conflict", null, { holdId, status: afterHold.status });
      throw new Error(`Unexpected hold status after transaction conflict: ${afterHold.status}`);
    }
    throw err;
  }

  bookingLog("convert-hold", "transaction completed, waiver and side effects", { holdId, bookingId });

  if (
    isSharedHold &&
    hold.experienceId &&
    parsedSlot &&
    (experienceForPricing as Experience | null)?.pricingType === "ticketed"
  ) {
    const invRef = getDepartureInventoryRef(db, hold.experienceId, parsedSlot.dateStr);
    const invSnap = await invRef.get();
    const rs = invSnap.exists ? ((invSnap.data() as { reservedSeats?: number }).reservedSeats ?? 0) : 0;
    if (rs < 0) {
      bookingError("convert-hold", "shared departure reservedSeats inconsistent after conversion (negative)", null, {
        holdId,
        bookingId,
        reservedSeats: rs,
      });
      await writeOperationalAlert({
        type: "shared_inventory_reserved_negative_after_conversion",
        holdId,
        bookingId,
        experienceId: hold.experienceId,
        dateStr: parsedSlot.dateStr,
        reservedSeats: rs,
        source: "convert-hold-to-booking",
      });
    }
  }

  void tryImmediateConfirmationSendForBooking(db, bookingId);
  if (enqueueWaiverInviteOutbox) {
    void tryImmediateWaiverInviteSendForBooking(db, bookingId);
  }
  if (hold.marketingOptIn) {
    const listId = bookingEnv.brevoMarketingListId;
    try {
      await upsertBrevoContact(customer.email, customer.name, customer.phone, listId ?? undefined);
      await db.collection("bookings").doc(bookingId).update({
        brevoSubscribedAt: Timestamp.now(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (listErr) {
      bookingError("convert-hold", "Brevo list subscribe failed", listErr, { bookingId });
    }
  }

  bookingLog("convert-hold", "convertHoldToBooking completed", { holdId, bookingId });
  return { bookingId };
}
