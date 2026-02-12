/**
 * Converts a paid hold into a booking in Firestore and sends confirmation email.
 * Used by: Stripe webhook (payment_intent.succeeded) and complete-after-payment API (client-triggered).
 * Idempotent: if hold is already converted, returns { alreadyConverted: true } and does nothing.
 */

import type { Firestore, DocumentReference } from "firebase-admin/firestore";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import { sendBookingConfirmationEmail, upsertBrevoContact } from "@/lib/booking/brevo";
import { logEmailSent } from "@/lib/booking/email-log";
import { buildAddonSelectionsForPricing, computePricing, getEffectiveRatePriceCents } from "@/lib/booking/pricing";
import { bookingEnv } from "@/lib/booking/env";
import type { Booking, Hold, Slot, Boat, Rate, Addon, FirestoreTimestamp } from "@/lib/booking/types";
import type { Experience, ExperienceRate, ExperienceAddon, BoatRate, ListingBoat } from "@/lib/booking/types";

function formatSlotDateTime(ts: { toDate(): Date }): string {
  return ts.toDate().toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export interface ConvertHoldInput {
  paymentIntentId: string;
  amountTotalCents?: number;
  currency?: string;
}

export type ConvertHoldResult = { bookingId: string } | { alreadyConverted: true };

export async function convertHoldToBooking(
  db: Firestore,
  holdId: string,
  input: ConvertHoldInput
): Promise<ConvertHoldResult> {
  const { FieldValue, Timestamp } = getFirestoreExports();
  const holdRef = db.collection("holds").doc(holdId);
  const holdSnap = await holdRef.get();
  if (!holdSnap.exists) {
    throw new Error("Hold not found");
  }
  const hold = holdSnap.data() as Hold;
  if (hold.status !== "active") {
    return { alreadyConverted: true };
  }

  const hasExperience = !!hold.experienceId;
  const hasBoat = !!hold.boatId;
  const isListingBoatFlow = hasExperience && hasBoat;
  let slotRef: DocumentReference;
  let experienceName: string;
  let boatNameForEmail: string;
  let locationText: string;
  let cancellationPolicyText: string;
  let rate: Rate | ExperienceRate | BoatRate;
  let slot: Slot;
  let experienceForPricing: Experience | null = null;
  let boatForPricing: ListingBoat | null = null;

  if (isListingBoatFlow) {
    const expSnap = await db.collection("experiences").doc(hold.experienceId!).get();
    const boatSnap = await db.collection("boats").doc(hold.boatId!).get();
    const rateSnap = await db.collection("experiences").doc(hold.experienceId!).collection("rates").doc(hold.rateId).get();
    const slotSnap = await db.collection("boats").doc(hold.boatId!).collection("slots").doc(hold.slotId).get();
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
    cancellationPolicyText = exp.cancellationPolicy?.fullText ?? "Cancel 24h before for full refund. See terms for details.";
    rate = rateSnap.data() as ExperienceRate;
    slot = slotSnap.data() as Slot;
    if (slot.holdId !== holdId) throw new Error("Slot not held by this hold");
    slotRef = db.collection("boats").doc(hold.boatId!).collection("slots").doc(hold.slotId);
  } else if (hasExperience) {
    const expSnap = await db.collection("experiences").doc(hold.experienceId!).get();
    const rateSnap = await db.collection("experiences").doc(hold.experienceId!).collection("rates").doc(hold.rateId).get();
    const slotSnap = await db.collection("experiences").doc(hold.experienceId!).collection("slots").doc(hold.slotId).get();
    if (!expSnap.exists || !rateSnap.exists || !slotSnap.exists) {
      throw new Error("Experience/rate/slot not found");
    }
    const exp = expSnap.data() as Experience;
    experienceForPricing = exp;
    experienceName = exp.title;
    boatNameForEmail = exp.title;
    locationText = exp.location?.addressText ?? "We'll send exact meeting point after booking.";
    cancellationPolicyText = exp.cancellationPolicy?.fullText ?? "Cancel 24h before for full refund. See terms for details.";
    rate = rateSnap.data() as ExperienceRate;
    slot = slotSnap.data() as Slot;
    if (slot.holdId !== holdId) throw new Error("Slot not held by this hold");
    slotRef = db.collection("experiences").doc(hold.experienceId!).collection("slots").doc(hold.slotId);
  } else {
    const boatSnap = await db.collection("boats").doc(hold.boatId!).get();
    const rateSnap = await db.collection("boats").doc(hold.boatId!).collection("rates").doc(hold.rateId).get();
    const slotSnap = await db.collection("boats").doc(hold.boatId!).collection("slots").doc(hold.slotId).get();
    if (!boatSnap.exists || !rateSnap.exists || !slotSnap.exists) {
      throw new Error("Boat/rate/slot not found");
    }
    const boat = boatSnap.data() as Boat;
    experienceName = boat.name;
    boatNameForEmail = boat.name;
    locationText = boat.defaultLocationText ?? "We'll send exact meeting point after booking.";
    cancellationPolicyText = boat.cancellationPolicyText ?? "Cancel 24h before for full refund. See terms for details.";
    rate = rateSnap.data() as Rate;
    slot = slotSnap.data() as Slot;
    if (slot.holdId !== holdId) throw new Error("Slot not held by this hold");
    slotRef = db.collection("boats").doc(hold.boatId!).collection("slots").doc(hold.slotId);
  }

  const addonsRef = hasExperience
    ? db.collection("experiences").doc(hold.experienceId!).collection("addons")
    : db.collection("boats").doc(hold.boatId!).collection("addons");
  const addonsSnap = await addonsRef.get();
  const addonsById = new Map<string, Addon | ExperienceAddon>();
  addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as Addon | ExperienceAddon));
  const addonsForPricing = buildAddonSelectionsForPricing(hold.addonSelections, addonsById);
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
  const pricing = computePricing({ rate: rateForPricing, addons: addonsForPricing, currency: "usd" });
  const holdTipCents = (hold as { tipCents?: number }).tipCents ?? 0;
  const finalPricing = { ...pricing, totalCents: pricing.totalCents + holdTipCents };
  const customer = hold.customerDraft;
  const specialNotes = hold.answers?.comments?.trim() || undefined;
  const bookingId = db.collection("bookings").doc().id;
  const booking: Omit<Booking, "createdAt"> & { createdAt: FirestoreTimestamp } = {
    ...(hold.experienceId ? { experienceId: hold.experienceId } : {}),
    ...(hold.boatId ? { boatId: hold.boatId } : {}),
    slotId: hold.slotId,
    rateId: hold.rateId,
    addonSelections: hold.addonSelections,
    partySize: hold.partySize,
    petsCount: hold.petsCount,
    answers: hold.answers,
    customer,
    marketingOptIn: hold.marketingOptIn,
    ...(specialNotes ? { specialNotes } : {}),
    pricing: finalPricing,
    status: "paid",
    stripe: {
      paymentIntentId: input.paymentIntentId,
      ...(input.amountTotalCents != null && { amountTotalCents: input.amountTotalCents }),
      ...(input.currency && { currency: input.currency }),
    },
    createdAt: Timestamp.now(),
  };

  await db.runTransaction(async (tx) => {
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
    tx.set(db.collection("bookings").doc(bookingId), booking);
    tx.update(holdRef, { status: "converted" });
  });

  const startTs = slot.startAt as { toDate(): Date };
  const endTs = slot.endAt as { toDate(): Date };
  const emailContext = {
    boatName: boatNameForEmail ?? experienceName,
    startAt: formatSlotDateTime(startTs),
    endAt: formatSlotDateTime(endTs),
    durationHours: rate.durationHours,
    locationText,
    cancellationPolicyText,
  };
  try {
    await sendBookingConfirmationEmail(booking as Booking, emailContext);
    await logEmailSent({
      to: customer.email,
      toName: customer.name,
      templateId: "booking_confirmation",
      subject: "Booking Confirmation – Boat Bros ATX",
      bookingId,
    });
  } catch (emailErr) {
    console.error("[convert-hold-to-booking] Brevo send failed", emailErr);
  }
  if (hold.marketingOptIn) {
    const listId = bookingEnv.brevoMarketingListId;
    try {
      await upsertBrevoContact(customer.email, customer.name, customer.phone, listId ?? undefined);
    } catch (listErr) {
      console.error("[convert-hold-to-booking] Brevo list subscribe failed", listErr);
    }
  }

  return { bookingId };
}
