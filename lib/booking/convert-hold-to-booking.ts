/**
 * Converts a paid hold into a booking in Firestore and sends confirmation email.
 * Used by: Stripe webhook (payment_intent.succeeded) and complete-after-payment API (client-triggered).
 * Idempotent: if hold is already converted, returns { alreadyConverted: true } and does nothing.
 * Supports full payment (legacy) or deposit-only (50/50) via paymentStage.
 */

import type { Firestore, DocumentReference } from "firebase-admin/firestore";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import { sendBookingConfirmationEmail, sendBookingConfirmationCopyToBusiness, upsertBrevoContact } from "@/lib/booking/brevo";
import { logEmailSent } from "@/lib/booking/email-log";
import { createWaiverForBooking, sendWaiverInviteAndMarkSent } from "@/lib/waiver/on-booking-created";
import { buildAddonSelectionsForPricing, computePricing, getEffectiveRatePriceCents } from "@/lib/booking/pricing";
import { bookingEnv } from "@/lib/booking/env";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { formatSlotDateTime } from "@/lib/booking/format-booking-datetime";
import { DEFAULT_CANCELLATION_POLICY } from "@/lib/booking/cancellation-policy";
import { getMaxGuestsForExperience } from "@/lib/booking/experience-capacity";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";
import { getDepartureInventoryRef, checkCapacityAndRelease } from "@/lib/booking/shared-departure-inventory";
import { BOOKING_STATUSES_SLOT_TAKEN } from "@/lib/booking/types";
import type { Booking, Hold, Slot, Boat, Rate, Addon, FirestoreTimestamp, BookingCardDisplay, BookingPricing } from "@/lib/booking/types";
import { bookingLog, bookingWarn, bookingError } from "@/lib/booking/debug";
import type { Experience, ExperienceRate, ExperienceAddon, BoatRate, ListingBoat } from "@/lib/booking/types";

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
  stripe: {
    customerId: string;
    paymentMethodId?: string;
    card?: BookingCardDisplay;
    totalCents: number;
    depositCents: number;
    finalCents: number;
  };
}

export type ConvertHoldInput = ConvertHoldInputFull | ConvertHoldInputDeposit;

export type ConvertHoldResult = { bookingId: string; discountLimitExceeded?: boolean } | { alreadyConverted: true };

function isDepositInput(input: ConvertHoldInput): input is ConvertHoldInputDeposit {
  return input.paymentStage === "deposit";
}

export async function convertHoldToBooking(
  db: Firestore,
  holdId: string,
  input: ConvertHoldInput
): Promise<ConvertHoldResult> {
  const isDeposit = isDepositInput(input);
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
  if (hold.status !== "active") {
    // When the hold is already converted, check whether the incoming payment intent matches
    // the one that was recorded during payment creation. A mismatch means a second charge
    // arrived for the same hold (e.g. two browser tabs, a webhook retry of a different PI).
    // Flag it for the refund workflow rather than silently ignoring it.
    if (hold.status === "converted" && input.paymentIntentId) {
      const isDeposit = isDepositInput(input);
      const holdPiField = isDeposit ? "depositPaymentIntentId" : "fullPaymentIntentId";
      const recordedPiId = (hold as unknown as Record<string, unknown>)[holdPiField] as string | undefined;
      if (recordedPiId && input.paymentIntentId !== recordedPiId) {
        try {
          await db.collection("pendingRefunds").add({
            holdId,
            duplicatePaymentIntentId: input.paymentIntentId,
            expectedPaymentIntentId: recordedPiId,
            reason: "duplicate_charge_after_conversion",
            status: "pending",
            createdAt: Timestamp.now(),
          });
          console.warn("[convert-hold-to-booking] Duplicate charge flagged for refund", {
            holdId,
            duplicatePaymentIntentId: input.paymentIntentId,
            expectedPaymentIntentId: recordedPiId,
          });
        } catch (refundFlagErr) {
          console.error("[convert-hold-to-booking] Failed to write pendingRefunds record", refundFlagErr);
        }
      }
    }
    bookingLog("convert-hold", "hold already converted, returning idempotent", { holdId, status: hold.status });
    return { alreadyConverted: true };
  }
  const expiresAtDate = (hold.expiresAt as { toDate(): Date }).toDate();
  if (expiresAtDate < new Date()) {
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

  const addonsSnap = await addonsPromise;
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
    // Ticketed (shared) experiences: price is per ticket, so multiply by partySize.
    const ticketQty = isSharedHold && (experienceForPricing as Experience)?.pricingType === "ticketed"
      ? Math.max(1, Math.floor(Number(hold.partySize ?? 1)))
      : 1;
    pricing = computePricing({ rate: rateForPricing, addons: addonsForPricing, currency: "usd", qty: ticketQty });
  }
  const holdTipCents = (hold as { tipCents?: number }).tipCents ?? 0;
  const holdDiscountCents = (hold as { discountCents?: number }).discountCents ?? 0;
  const finalPricing = { ...pricing, totalCents: Math.max(0, pricing.totalCents + holdTipCents - holdDiscountCents) };
  const fullInput = input as ConvertHoldInputFull;
  const customer = fullInput.customerOverride ?? hold.customerDraft;
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

  let discountRef: DocumentReference | null = null;
  if (holdDiscountCode) {
    const discountSnap = await db.collection("discounts").where("code", "==", holdDiscountCode).limit(1).get();
    if (!discountSnap.empty) {
      discountRef = discountSnap.docs[0].ref;
    }
  }

  const slotStart = (slot.startAt as { toDate(): Date }).toDate();
  const finalChargeAtDate = new Date(slotStart.getTime() - 48 * 60 * 60 * 1000);
  const finalChargeAtTimestamp = Timestamp.fromDate(finalChargeAtDate);

  const stripeBlock: Booking["stripe"] = isDeposit
    ? {
        depositPaymentIntentId: input.paymentIntentId,
        customerId: input.stripe.customerId,
        paymentMethodId: input.stripe.paymentMethodId,
        depositAmountCents: input.stripe.depositCents,
        finalAmountCents: input.stripe.finalCents,
        totalAmountCents: input.stripe.totalCents,
        depositPaidAt: Timestamp.now(),
        ...(input.amountTotalCents != null && { amountTotalCents: input.amountTotalCents }),
        ...(input.currency && { currency: input.currency }),
      }
    : {
        paymentIntentId: input.paymentIntentId,
        ...(input.amountTotalCents != null && { amountTotalCents: input.amountTotalCents }),
        ...(input.currency && { currency: input.currency }),
        ...(fullInput.checkoutSessionId && { checkoutSessionId: fullInput.checkoutSessionId }),
      };

  const booking: Omit<Booking, "createdAt"> & { createdAt: FirestoreTimestamp } = {
    ...(hold.experienceId ? { experienceId: hold.experienceId } : {}),
    ...(hold.boatId ? { boatId: hold.boatId } : {}),
    ...((hold as { bookingMode?: "shared" | "charter" }).bookingMode ? { bookingMode: (hold as { bookingMode?: "shared" | "charter" }).bookingMode } : {}),
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
  };

  bookingLog("convert-hold", "starting transaction (slot update + booking doc + hold status)", { holdId, bookingId });
  let discountLimitExceeded = false;
  await db.runTransaction(async (tx) => {
    if (isSharedHold && hold.experienceId && parsedSlot && experienceForPricing) {
      const inventoryRef = getDepartureInventoryRef(db, hold.experienceId, parsedSlot.dateStr);
      const expSlug = typeof (experienceForPricing as Experience).slug === "string" ? (experienceForPricing as Experience).slug.trim() : "";
      const slugVariants = getExperienceIdVariants(hold.experienceId, expSlug);
      const bookSnaps = await Promise.all(
        slugVariants.map((v) =>
          tx.get(db.collection("bookings").where("experienceId", "==", v).where("startDateStr", "==", parsedSlot!.dateStr))
        )
      );
      const seen = new Set<string>();
      let sold = 0;
      for (const snap of bookSnaps) {
        for (const doc of snap.docs) {
          if (seen.has(doc.id)) continue;
          seen.add(doc.id);
          const b = doc.data() as { partySize?: number; status?: string; bookingMode?: string };
          if (typeof b.partySize !== "number") continue;
          if (!BOOKING_STATUSES_SLOT_TAKEN.has(b.status as never)) continue;
          if (b.bookingMode === "charter") continue;
          sold += b.partySize;
        }
      }
      const capacity =
        (experienceForPricing as Experience).maxCapacity ?? getMaxGuestsForExperience(experienceForPricing);
      await checkCapacityAndRelease(tx, inventoryRef, capacity, sold, hold.partySize);
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
    tx.set(db.collection("bookings").doc(bookingId), booking);
    tx.update(holdRef, { status: "converted" });
    if (discountRef) {
      const discountSnap = await tx.get(discountRef);
      if (discountSnap.exists) {
        const discountData = discountSnap.data() as { usedCount?: number; maxRedemptions?: number };
        const usedCount = discountData.usedCount ?? 0;
        const maxRedemptions = discountData.maxRedemptions;
        if (typeof maxRedemptions === "number" && usedCount >= maxRedemptions) {
          discountLimitExceeded = true;
          tx.set(db.collection("pendingRefunds").doc(), {
            holdId,
            bookingId,
            reason: "discount_limit_exceeded",
            status: "pending",
            createdAt: Timestamp.now(),
          });
        } else {
          const newCount = usedCount + 1;
          tx.update(discountRef, {
            usedCount: newCount,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
    }
  });

  bookingLog("convert-hold", "transaction completed, sending emails and side effects", { holdId, bookingId });

  const startTs = slot.startAt as { toDate(): Date };
  const endTs = slot.endAt as { toDate(): Date };
  // Manage booking link removed from confirmation email per product request.
  const manageLink: string | undefined = undefined;
  const waiverResult = await createWaiverForBooking({
    bookingId,
    customerEmail: customer.email,
    customerName: customer.name,
  });
  const resolvedAddonSummary =
    hold.addonSelections?.length > 0
      ? hold.addonSelections
          .map((sel) => `${addonsById.get(sel.addonId)?.name ?? sel.addonId}: qty ${sel.qty}`)
          .join(", ")
      : "None";
  const emailContext = {
    boatName: boatNameForEmail ?? experienceName,
    startAt: formatSlotDateTime(startTs),
    endAt: formatSlotDateTime(endTs),
    durationHours: rate.durationHours,
    locationText,
    cancellationPolicyText,
    isDeposit: !!isDeposit,
    finalChargeAt:
      !!isDeposit && (booking as Booking).finalChargeAt
        ? ((booking as Booking).finalChargeAt as { toDate(): Date }).toDate().toISOString()
        : undefined,
    manageLink,
    waiverSigningUrl: waiverResult?.includeInConfirmationEmail ? waiverResult.signingUrl : undefined,
    waiverGroupSigningUrl: waiverResult?.groupSigningUrl,
    pricingType: experienceForPricing?.pricingType,
    addonsSummary: resolvedAddonSummary,
  };
  try {
    await Promise.all([
      sendBookingConfirmationEmail(booking as Booking, emailContext),
      sendBookingConfirmationCopyToBusiness(booking as Booking, emailContext),
    ]);
  } catch (emailErr) {
    bookingError("convert-hold", "Brevo confirmation email failed", emailErr, { bookingId });
  }
  const confirmationSubject =
    waiverResult?.includeInConfirmationEmail && waiverResult?.signingUrl
      ? "Booking Confirmation & Waiver – Boat Bros ATX"
      : "Booking Confirmation – Boat Bros ATX";
  logEmailSent({
    to: customer.email,
    toName: customer.name,
    templateId: "booking_confirmation",
    subject: confirmationSubject,
    bookingId,
  }).catch((err) => bookingError("convert-hold", "logEmailSent failed", err, { bookingId }));
  if (waiverResult?.sendSeparateWaiverInvite) {
    try {
      await sendWaiverInviteAndMarkSent(waiverResult);
    } catch (waiverErr) {
      bookingError("convert-hold", "waiver invite send failed", waiverErr, { bookingId });
    }
  }
  if (hold.marketingOptIn) {
    const listId = bookingEnv.brevoMarketingListId;
    try {
      await upsertBrevoContact(customer.email, customer.name, customer.phone, listId ?? undefined);
    } catch (listErr) {
      bookingError("convert-hold", "Brevo list subscribe failed", listErr, { bookingId });
    }
  }

  bookingLog("convert-hold", "convertHoldToBooking completed", { holdId, bookingId });
  return discountLimitExceeded ? { bookingId, discountLimitExceeded: true } : { bookingId };
}
