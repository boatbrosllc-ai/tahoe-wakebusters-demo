import type { Firestore } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { buildAddonSelectionsForPricing, computePricing, getEffectiveRatePriceCents } from "@/lib/booking/pricing";
import type { Hold, Rate, Addon, Experience } from "@/lib/booking/types";
import type { ExperienceRate, ExperienceAddon, BoatRate, ListingBoat } from "@/lib/booking/types";

function parseBody(body: unknown): { holdId: string; payFullAmount: boolean } | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const holdId = typeof o.holdId === "string" ? o.holdId : null;
  if (!holdId) return null;
  // Default to deposit (false): only charge full when client explicitly sends payFullAmount: true
  const payFullAmount = o.payFullAmount === true;
  return { holdId, payFullAmount };
}

/** Ensure Stripe Customer exists; use stripeCustomerIndex by email (no Stripe list by email). */
async function getOrCreateStripeCustomer(
  db: Firestore,
  stripe: import("stripe").Stripe,
  email: string,
  name: string,
  phone: string
): Promise<string> {
  const { FieldValue, Timestamp } = getFirestoreExports();
  const emailLower = email.trim().toLowerCase();
  const indexRef = db.collection("stripeCustomerIndex").doc(emailLower);
  const indexSnap = await indexRef.get();
  if (indexSnap.exists) {
    const data = indexSnap.data() as { customerId: string };
    if (data.customerId) return data.customerId;
  }
  const customer = await stripe.customers.create({
    email: email.trim(),
    name: name.trim() || undefined,
    phone: phone.trim() || undefined,
    metadata: { emailLower },
  });
  await indexRef.set({
    customerId: customer.id,
    createdAt: Timestamp.now(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return customer.id;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = parseBody(body);
    if (!input) {
      return NextResponse.json({ error: "holdId required" }, { status: 400 });
    }
    const db = getDb();
    const holdRef = db.collection("holds").doc(input.holdId);
    const holdSnap = await holdRef.get();
    if (!holdSnap.exists) {
      return NextResponse.json({ error: "Hold not found" }, { status: 404 });
    }
    const hold = holdSnap.data() as Hold;
    if (hold.status !== "active") {
      return NextResponse.json({ error: "Hold expired or already used" }, { status: 400 });
    }
    const expiresAt = hold.expiresAt as { toDate(): Date };
    if (expiresAt.toDate() < new Date()) {
      return NextResponse.json({ error: "Hold expired" }, { status: 400 });
    }
    const hasExperience = !!hold.experienceId;
    const hasBoat = !!hold.boatId;
    const isListingBoatFlow = hasExperience && hasBoat;
    let pricing: import("@/lib/booking/types").BookingPricing;
    if (hold.pricing) {
      pricing = hold.pricing as import("@/lib/booking/types").BookingPricing;
    } else {
      let rate: Rate | ExperienceRate | BoatRate;
      const addonsById = new Map<string, Addon | ExperienceAddon>();
      if (isListingBoatFlow || hasExperience) {
        const rateSnap = await db.collection("experiences").doc(hold.experienceId!).collection("rates").doc(hold.rateId).get();
        if (!rateSnap.exists) return NextResponse.json({ error: "Rate not found" }, { status: 404 });
        rate = rateSnap.data() as ExperienceRate;
        const addonsSnap = await db.collection("experiences").doc(hold.experienceId!).collection("addons").get();
        addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as ExperienceAddon));
      } else {
        const boatSnap = await db.collection("boats").doc(hold.boatId!).get();
        if (!boatSnap.exists) return NextResponse.json({ error: "Boat not found" }, { status: 404 });
        const rateSnap = await db.collection("boats").doc(hold.boatId!).collection("rates").doc(hold.rateId).get();
        if (!rateSnap.exists) return NextResponse.json({ error: "Rate not found" }, { status: 404 });
        rate = rateSnap.data() as Rate;
        const addonsSnap = await db.collection("boats").doc(hold.boatId!).collection("addons").get();
        addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as Addon));
      }
      const addonsForPricing = buildAddonSelectionsForPricing(hold.addonSelections, addonsById);
      let rateForPricing: Rate | ExperienceRate | BoatRate = rate;
      if (hasExperience && "priceCents" in rate) {
        const parsed = parseSlotId(hold.slotId);
        if (parsed) {
          const slotStart = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0).start;
          const expDoc = await db.collection("experiences").doc(hold.experienceId!).get();
          const experience = expDoc.exists ? (expDoc.data() as Experience) : null;
          if (experience) {
            rateForPricing = { ...rate, priceCents: getEffectiveRatePriceCents(rate as { priceCents: number; priceWeekendCents?: number; priceFriSunCents?: number; priceHolidayCents?: number }, slotStart, experience.holidayDates, experience.weekendDays, experience.friSunDays) };
          }
        }
      }
      pricing = computePricing({ rate: rateForPricing, addons: addonsForPricing, currency: "usd" });
    }
    const tipCents = (hold as { tipCents?: number }).tipCents ?? 0;
    const discountCents = (hold as { discountCents?: number }).discountCents ?? 0;
    const totalCents = Math.max(0, pricing.totalCents + tipCents - discountCents);
    const depositCents = Math.round(totalCents * 0.5);
    const finalCents = totalCents - depositCents;
    // Shared ticketed experiences always charge full — no deposit option.
    const payFullAmount = (hold as { bookingMode?: string }).bookingMode === "shared"
      ? true
      : input.payFullAmount;
    const chargeCents = payFullAmount ? totalCents : depositCents;

    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomer(
      db,
      stripe,
      hold.customerDraft.email,
      hold.customerDraft.name,
      hold.customerDraft.phone
    );

    // Reuse an existing active PaymentIntent for this hold+stage to prevent duplicate charges.
    // The field name is scoped to the payment stage so deposit and full retries never cross-contaminate.
    const existingPiId = payFullAmount ? hold.fullPaymentIntentId : hold.depositPaymentIntentId;
    if (existingPiId) {
      try {
        const existing = await stripe.paymentIntents.retrieve(existingPiId);
        if (existing.status !== "canceled" && existing.status !== "succeeded") {
          if (!existing.client_secret) {
            return NextResponse.json({ error: "PaymentIntent missing client secret" }, { status: 500 });
          }
          return NextResponse.json({
            clientSecret: existing.client_secret,
            paymentIntentId: existing.id,
            depositCents: payFullAmount ? totalCents : depositCents,
            finalCents: payFullAmount ? 0 : finalCents,
            totalCents,
            payFullAmount,
          });
        }
      } catch (piErr) {
        console.warn("[create-payment-intent] Failed to retrieve existing PI, creating new one", existingPiId, piErr);
      }
    }

    const metadata: Record<string, string> = {
      holdId: input.holdId,
      slotId: hold.slotId,
      rateId: hold.rateId,
      payment_stage: payFullAmount ? "full" : "deposit",
      totalCents: String(totalCents),
      depositCents: String(depositCents),
      finalCents: String(finalCents),
    };
    if (hold.experienceId) metadata.experienceId = hold.experienceId;
    if (hold.boatId) metadata.boatId = hold.boatId;

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: chargeCents,
        currency: "usd",
        customer: customerId,
        automatic_payment_methods: { enabled: true },
        setup_future_usage: "off_session",
        metadata,
      },
      { idempotencyKey: `pi-${input.holdId}-${payFullAmount ? "full" : "deposit"}` }
    );
    if (!paymentIntent.client_secret) {
      return NextResponse.json({ error: "PaymentIntent missing client secret" }, { status: 500 });
    }
    // Persist the PI id on the hold so retries can reuse it instead of creating a new charge.
    await holdRef.update(
      payFullAmount ? { fullPaymentIntentId: paymentIntent.id } : { depositPaymentIntentId: paymentIntent.id }
    );
    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      depositCents: payFullAmount ? totalCents : depositCents,
      finalCents: payFullAmount ? 0 : finalCents,
      totalCents,
      payFullAmount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create payment intent failed";
    console.error("[create-payment-intent]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
