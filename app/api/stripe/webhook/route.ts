import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/booking/stripe-client";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { sendBookingConfirmationEmail, upsertBrevoContact } from "@/lib/booking/brevo";
import { logEmailSent } from "@/lib/booking/email-log";
import { buildAddonSelectionsForPricing, computePricing } from "@/lib/booking/pricing";
import { bookingEnv } from "@/lib/booking/env";
import type { Booking, Hold, Slot, Boat, Rate, Addon } from "@/lib/booking/types";
import type { Experience, ExperienceRate, ExperienceAddon, BoatRate } from "@/lib/booking/types";

function formatSlotDateTime(ts: { toDate(): Date }): string {
  const d = ts.toDate();
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const sig = request.headers.get("stripe-signature");
    if (!sig) {
      return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
    }
    const webhookSecret = bookingEnv.stripeWebhookSecret;
    let event: Stripe.Event;
    const stripe = getStripe();
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Webhook signature verification failed";
      console.error("[stripe-webhook]", message);
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const db = getDb();
    const { FieldValue, Timestamp } = getFirestoreExports();
    const eventId = event.id;
    const eventsRef = db.collection("stripeEvents");
    // Claim the event in a transaction so Stripe retries don't re-run the handler (avoids duplicate writes + quota).
    const claimed = await db.runTransaction(async (tx) => {
      const d = await tx.get(eventsRef.doc(eventId));
      if (d.exists) return false;
      tx.set(eventsRef.doc(eventId), { receivedAt: Timestamp.now(), status: "processing" });
      return true;
    });
    if (!claimed) {
      return NextResponse.json({ received: true });
    }
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const holdId = session.metadata?.holdId;
      if (!holdId) {
        console.error("[stripe-webhook] checkout.session.completed missing holdId in metadata");
        await eventsRef.doc(eventId).set({ processedAt: Timestamp.now() });
        return NextResponse.json({ received: true });
      }
      const holdRef = db.collection("holds").doc(holdId);
      const holdSnap = await holdRef.get();
      if (!holdSnap.exists) {
        await eventsRef.doc(eventId).set({ processedAt: Timestamp.now(), error: "Hold not found" });
        return NextResponse.json({ received: true });
      }
      const hold = holdSnap.data() as Hold;
      if (hold.status !== "active") {
        await eventsRef.doc(eventId).set({ processedAt: Timestamp.now(), error: "Hold already converted" });
        return NextResponse.json({ received: true });
      }
      const hasExperience = !!hold.experienceId;
      const hasBoat = !!hold.boatId;
      const isListingBoatFlow = hasExperience && hasBoat;
      let slotRef: import("firebase-admin").firestore.DocumentReference;
      let experienceName: string;
      let boatNameForEmail: string;
      let locationText: string;
      let cancellationPolicyText: string;
      let rate: Rate | ExperienceRate | BoatRate;
      let slot: Slot;
      if (isListingBoatFlow) {
        const expSnap = await db.collection("experiences").doc(hold.experienceId!).get();
        const boatSnap = await db.collection("boats").doc(hold.boatId!).get();
        const rateSnap = await db.collection("boats").doc(hold.boatId!).collection("rates").doc(hold.rateId).get();
        const slotSnap = await db.collection("experiences").doc(hold.experienceId!).collection("slots").doc(hold.slotId).get();
        if (!expSnap.exists || !boatSnap.exists || !rateSnap.exists || !slotSnap.exists) {
          await eventsRef.doc(eventId).set({ processedAt: Timestamp.now(), error: "Experience/boat/rate/slot not found" });
          return NextResponse.json({ received: true });
        }
        const exp = expSnap.data() as Experience;
        const boat = boatSnap.data() as { name?: string };
        experienceName = exp.title;
        boatNameForEmail = boat.name ?? exp.title;
        locationText = exp.location?.addressText ?? "We'll send exact meeting point after booking.";
        cancellationPolicyText = exp.cancellationPolicy?.fullText ?? "Cancel 24h before for full refund. See terms for details.";
        rate = rateSnap.data() as BoatRate;
        slot = slotSnap.data() as Slot;
        if (slot.holdId !== holdId) {
          await eventsRef.doc(eventId).set({ processedAt: Timestamp.now(), error: "Slot not held by this hold" });
          return NextResponse.json({ received: true });
        }
        slotRef = db.collection("experiences").doc(hold.experienceId!).collection("slots").doc(hold.slotId);
      } else if (hasExperience) {
        const expSnap = await db.collection("experiences").doc(hold.experienceId!).get();
        const rateSnap = await db.collection("experiences").doc(hold.experienceId!).collection("rates").doc(hold.rateId).get();
        const slotSnap = await db.collection("experiences").doc(hold.experienceId!).collection("slots").doc(hold.slotId).get();
        if (!expSnap.exists || !rateSnap.exists || !slotSnap.exists) {
          await eventsRef.doc(eventId).set({ processedAt: Timestamp.now(), error: "Experience/rate/slot not found" });
          return NextResponse.json({ received: true });
        }
        const exp = expSnap.data() as Experience;
        experienceName = exp.title;
        boatNameForEmail = exp.title;
        locationText = exp.location?.addressText ?? "We'll send exact meeting point after booking.";
        cancellationPolicyText = exp.cancellationPolicy?.fullText ?? "Cancel 24h before for full refund. See terms for details.";
        rate = rateSnap.data() as ExperienceRate;
        slot = slotSnap.data() as Slot;
        if (slot.holdId !== holdId) {
          await eventsRef.doc(eventId).set({ processedAt: Timestamp.now(), error: "Slot not held by this hold" });
          return NextResponse.json({ received: true });
        }
        slotRef = db.collection("experiences").doc(hold.experienceId!).collection("slots").doc(hold.slotId);
      } else {
        const boatSnap = await db.collection("boats").doc(hold.boatId!).get();
        const rateSnap = await db.collection("boats").doc(hold.boatId!).collection("rates").doc(hold.rateId).get();
        const slotSnap = await db.collection("boats").doc(hold.boatId!).collection("slots").doc(hold.slotId).get();
        if (!boatSnap.exists || !rateSnap.exists || !slotSnap.exists) {
          await eventsRef.doc(eventId).set({ processedAt: Timestamp.now(), error: "Boat/rate/slot not found" });
          return NextResponse.json({ received: true });
        }
        const boat = boatSnap.data() as Boat;
        experienceName = boat.name;
        boatNameForEmail = boat.name;
        locationText = boat.defaultLocationText ?? "We'll send exact meeting point after booking.";
        cancellationPolicyText = boat.cancellationPolicyText ?? "Cancel 24h before for full refund. See terms for details.";
        rate = rateSnap.data() as Rate;
        slot = slotSnap.data() as Slot;
        if (slot.holdId !== holdId) {
          await eventsRef.doc(eventId).set({ processedAt: Timestamp.now(), error: "Slot not held by this hold" });
          return NextResponse.json({ received: true });
        }
        slotRef = db.collection("boats").doc(hold.boatId!).collection("slots").doc(hold.slotId);
      }
      const addonsRef = hasExperience
        ? db.collection("experiences").doc(hold.experienceId!).collection("addons")
        : db.collection("boats").doc(hold.boatId!).collection("addons");
      const addonsSnap = await addonsRef.get();
      const addonsById = new Map<string, Addon | ExperienceAddon>();
      addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as Addon | ExperienceAddon));
      const addonsForPricing = buildAddonSelectionsForPricing(hold.addonSelections, addonsById);
      const pricing = computePricing({ rate, addons: addonsForPricing, currency: "usd" });
      const holdTipCents = (hold as { tipCents?: number }).tipCents ?? 0;
      const finalPricing = { ...pricing, totalCents: pricing.totalCents + holdTipCents };
      const paymentIntentId =
        typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? undefined;
      const customerDetails = session.customer_details;
      const customer =
        customerDetails?.email?.trim()
          ? {
              name: (customerDetails.name ?? "").trim() || hold.customerDraft.name,
              email: customerDetails.email.trim(),
              phone: (customerDetails.phone ?? "").trim() || hold.customerDraft.phone,
            }
          : hold.customerDraft;
      let specialNotes: string | undefined;
      if (Array.isArray(session.custom_fields)) {
        const field = session.custom_fields.find((f: { key?: string }) => f.key === "special_notes");
        const v = field && (field as { value?: string | { value?: string } }).value;
        specialNotes =
          typeof v === "string" ? v.trim() || undefined : typeof v === "object" && v?.value != null ? String(v.value).trim() || undefined : undefined;
      }
      const bookingId = db.collection("bookings").doc().id;
      const booking: Omit<Booking, "createdAt"> & { createdAt: Timestamp } = {
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
        stripe: { checkoutSessionId: session.id, paymentIntentId },
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
        console.error("[stripe-webhook] Brevo send failed", emailErr);
      }
      if (hold.marketingOptIn) {
        const listId = bookingEnv.brevoMarketingListId;
        try {
          await upsertBrevoContact(customer.email, customer.name, customer.phone, listId ?? undefined);
        } catch (listErr) {
          console.error("[stripe-webhook] Brevo list subscribe failed", listErr);
        }
      }
    }
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object as Stripe.PaymentIntent;
      const holdId = pi.metadata?.holdId;
      console.log("[stripe-webhook] payment_intent.succeeded", { eventId, holdId, paymentIntentId: pi.id });
      if (!holdId) {
        console.error("[stripe-webhook] payment_intent.succeeded missing holdId in metadata");
        await eventsRef.doc(eventId).set({ processedAt: Timestamp.now(), error: "Missing holdId in metadata" });
        return NextResponse.json({ received: true });
      }
      const holdRef = db.collection("holds").doc(holdId);
      const holdSnap = await holdRef.get();
      if (!holdSnap.exists) {
        console.error("[stripe-webhook] payment_intent.succeeded hold not found", { holdId });
        await eventsRef.doc(eventId).set({ processedAt: Timestamp.now(), error: "Hold not found", holdId });
        return NextResponse.json({ received: true });
      }
      const hold = holdSnap.data() as Hold;
      if (hold.status !== "active") {
        console.error("[stripe-webhook] payment_intent.succeeded hold not active", { holdId, status: hold.status });
        await eventsRef.doc(eventId).set({ processedAt: Timestamp.now(), error: "Hold already converted", holdId });
        return NextResponse.json({ received: true });
      }
      const hasExperience = !!hold.experienceId;
      const hasBoat = !!hold.boatId;
      const isListingBoatFlow = hasExperience && hasBoat;
      let slotRef: import("firebase-admin").firestore.DocumentReference;
      let experienceName: string;
      let boatNameForEmail: string;
      let locationText: string;
      let cancellationPolicyText: string;
      let rate: Rate | ExperienceRate | BoatRate;
      let slot: Slot;
      if (isListingBoatFlow) {
        const expSnap = await db.collection("experiences").doc(hold.experienceId!).get();
        const boatSnap = await db.collection("boats").doc(hold.boatId!).get();
        const rateSnap = await db.collection("boats").doc(hold.boatId!).collection("rates").doc(hold.rateId).get();
        const slotSnap = await db.collection("experiences").doc(hold.experienceId!).collection("slots").doc(hold.slotId).get();
        if (!expSnap.exists || !boatSnap.exists || !rateSnap.exists || !slotSnap.exists) {
          await eventsRef.doc(eventId).set({ processedAt: Timestamp.now(), error: "Experience/boat/rate/slot not found" });
          return NextResponse.json({ received: true });
        }
        const exp = expSnap.data() as Experience;
        const boat = boatSnap.data() as { name?: string };
        experienceName = exp.title;
        boatNameForEmail = boat.name ?? exp.title;
        locationText = exp.location?.addressText ?? "We'll send exact meeting point after booking.";
        cancellationPolicyText = exp.cancellationPolicy?.fullText ?? "Cancel 24h before for full refund. See terms for details.";
        rate = rateSnap.data() as BoatRate;
        slot = slotSnap.data() as Slot;
        if (slot.holdId !== holdId) {
          await eventsRef.doc(eventId).set({ processedAt: Timestamp.now(), error: "Slot not held by this hold" });
          return NextResponse.json({ received: true });
        }
        slotRef = db.collection("experiences").doc(hold.experienceId!).collection("slots").doc(hold.slotId);
      } else if (hasExperience) {
        const expSnap = await db.collection("experiences").doc(hold.experienceId!).get();
        const rateSnap = await db.collection("experiences").doc(hold.experienceId!).collection("rates").doc(hold.rateId).get();
        const slotSnap = await db.collection("experiences").doc(hold.experienceId!).collection("slots").doc(hold.slotId).get();
        if (!expSnap.exists || !rateSnap.exists || !slotSnap.exists) {
          await eventsRef.doc(eventId).set({ processedAt: Timestamp.now(), error: "Experience/rate/slot not found" });
          return NextResponse.json({ received: true });
        }
        const exp = expSnap.data() as Experience;
        experienceName = exp.title;
        boatNameForEmail = exp.title;
        locationText = exp.location?.addressText ?? "We'll send exact meeting point after booking.";
        cancellationPolicyText = exp.cancellationPolicy?.fullText ?? "Cancel 24h before for full refund. See terms for details.";
        rate = rateSnap.data() as ExperienceRate;
        slot = slotSnap.data() as Slot;
        if (slot.holdId !== holdId) {
          await eventsRef.doc(eventId).set({ processedAt: Timestamp.now(), error: "Slot not held by this hold" });
          return NextResponse.json({ received: true });
        }
        slotRef = db.collection("experiences").doc(hold.experienceId!).collection("slots").doc(hold.slotId);
      } else {
        const boatSnap = await db.collection("boats").doc(hold.boatId!).get();
        const rateSnap = await db.collection("boats").doc(hold.boatId!).collection("rates").doc(hold.rateId).get();
        const slotSnap = await db.collection("boats").doc(hold.boatId!).collection("slots").doc(hold.slotId).get();
        if (!boatSnap.exists || !rateSnap.exists || !slotSnap.exists) {
          await eventsRef.doc(eventId).set({ processedAt: Timestamp.now(), error: "Boat/rate/slot not found" });
          return NextResponse.json({ received: true });
        }
        const boat = boatSnap.data() as Boat;
        experienceName = boat.name;
        boatNameForEmail = boat.name;
        locationText = boat.defaultLocationText ?? "We'll send exact meeting point after booking.";
        cancellationPolicyText = boat.cancellationPolicyText ?? "Cancel 24h before for full refund. See terms for details.";
        rate = rateSnap.data() as Rate;
        slot = slotSnap.data() as Slot;
        if (slot.holdId !== holdId) {
          await eventsRef.doc(eventId).set({ processedAt: Timestamp.now(), error: "Slot not held by this hold" });
          return NextResponse.json({ received: true });
        }
        slotRef = db.collection("boats").doc(hold.boatId!).collection("slots").doc(hold.slotId);
      }
      const addonsRef = hasExperience
        ? db.collection("experiences").doc(hold.experienceId!).collection("addons")
        : db.collection("boats").doc(hold.boatId!).collection("addons");
      const addonsSnap = await addonsRef.get();
      const addonsById = new Map<string, Addon | ExperienceAddon>();
      addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as Addon | ExperienceAddon));
      const addonsForPricing = buildAddonSelectionsForPricing(hold.addonSelections, addonsById);
      const pricing = computePricing({ rate, addons: addonsForPricing, currency: "usd" });
      const holdTipCents = (hold as { tipCents?: number }).tipCents ?? 0;
      const finalPricing = { ...pricing, totalCents: pricing.totalCents + holdTipCents };
      const customer = hold.customerDraft;
      const specialNotes = hold.answers?.comments?.trim() || undefined;
      const bookingId = db.collection("bookings").doc().id;
      const booking: Omit<Booking, "createdAt"> & { createdAt: Timestamp } = {
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
        stripe: { paymentIntentId: pi.id },
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
      console.log("[stripe-webhook] payment_intent.succeeded booking created", { bookingId, holdId });
      await eventsRef.doc(eventId).set(
        { processedAt: Timestamp.now(), outcome: "booking_created", bookingId, holdId },
        { merge: true }
      );
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
        console.error("[stripe-webhook] Brevo send failed", emailErr);
      }
      if (hold.marketingOptIn) {
        const listId = bookingEnv.brevoMarketingListId;
        try {
          await upsertBrevoContact(customer.email, customer.name, customer.phone, listId ?? undefined);
        } catch (listErr) {
          console.error("[stripe-webhook] Brevo list subscribe failed", listErr);
        }
      }
    }
    await eventsRef.doc(eventId).set({ processedAt: Timestamp.now() }, { merge: true });
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe-webhook]", err);
    // Mark event as failed so doc is not left in "processing" and retries return 200
    if (event?.id) {
      try {
        const db = getDb();
        const { Timestamp } = getFirestoreExports();
        await db.collection("stripeEvents").doc(event.id).set({
          processedAt: Timestamp.now(),
          error: err instanceof Error ? err.message : String(err),
        });
      } catch (_) {
        // ignore
      }
    }
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
