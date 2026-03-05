import type { Firestore } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { buildAddonSelectionsForPricing, computePricing, getEffectiveRatePriceCents } from "@/lib/booking/pricing";
import type { Hold, Rate, Addon, Experience } from "@/lib/booking/types";
import type { ExperienceRate, ExperienceAddon, BoatRate, ListingBoat } from "@/lib/booking/types";
import { bookingLog, bookingWarn, bookingError } from "@/lib/booking/debug";

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
    bookingLog("create-payment-intent", "request started");
    const body = await request.json();
    const input = parseBody(body);
    if (!input) {
      bookingLog("create-payment-intent", "invalid body: holdId required");
      return NextResponse.json({ error: "holdId required" }, { status: 400 });
    }
    bookingLog("create-payment-intent", "parsed input", { holdId: input.holdId, payFullAmount: input.payFullAmount });
    const db = getDb();
    const holdRef = db.collection("holds").doc(input.holdId);
    const holdSnap = await holdRef.get();
    if (!holdSnap.exists) {
      bookingLog("create-payment-intent", "hold not found", { holdId: input.holdId });
      return NextResponse.json({ error: "Hold not found" }, { status: 404 });
    }
    const hold = holdSnap.data() as Hold;
    if (hold.status !== "active") {
      bookingLog("create-payment-intent", "hold not active", { holdId: input.holdId, status: hold.status });
      return NextResponse.json({ error: "Hold expired or already used" }, { status: 400 });
    }
    const expiresAt = hold.expiresAt as { toDate(): Date };
    if (expiresAt.toDate() < new Date()) {
      bookingLog("create-payment-intent", "hold expired", { holdId: input.holdId, expiresAt: expiresAt.toDate().toISOString() });
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
    bookingLog("create-payment-intent", "pricing", {
      holdId: input.holdId,
      totalCents,
      depositCents,
      finalCents,
      payFullAmount,
      chargeCents,
    });

    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomer(
      db,
      stripe,
      hold.customerDraft.email,
      hold.customerDraft.name,
      hold.customerDraft.phone
    );

    // Reuse an existing active PaymentIntent for this hold+stage to prevent duplicate charges.
    // Validate amount matches current chargeCents; if not, cancel/replace and persist new id so we never charge a stale amount.
    const existingPiId = payFullAmount ? hold.fullPaymentIntentId : hold.depositPaymentIntentId;
    if (existingPiId) {
      try {
        bookingLog("create-payment-intent", "checking existing PI", { holdId: input.holdId, existingPiId: existingPiId.slice(0, 24) + "...", payFullAmount });
        const existing = await stripe.paymentIntents.retrieve(existingPiId);
        if (existing.status !== "canceled" && existing.status !== "succeeded") {
          const existingAmount = existing.amount;
          if (existingAmount === chargeCents && existing.client_secret) {
            bookingLog("create-payment-intent", "reusing existing PI", { holdId: input.holdId, paymentIntentId: existing.id });
            return NextResponse.json({
              clientSecret: existing.client_secret,
              paymentIntentId: existing.id,
              depositCents: payFullAmount ? totalCents : depositCents,
              finalCents: payFullAmount ? 0 : finalCents,
              totalCents,
              payFullAmount,
            });
          }
          // Amount mismatch or missing secret: cancel stale intent so we create a fresh one with correct amount.
          bookingLog("create-payment-intent", "existing PI stale (amount mismatch or no secret), creating new", {
            holdId: input.holdId,
            existingAmount,
            chargeCents,
            status: existing.status,
          });
          if (existing.status === "requires_payment_method" || existing.status === "requires_confirmation") {
            await stripe.paymentIntents.cancel(existingPiId).catch(() => {});
          }
          const { FieldValue } = getFirestoreExports();
          await holdRef.update(
            payFullAmount ? { fullPaymentIntentId: FieldValue.delete() } : { depositPaymentIntentId: FieldValue.delete() }
          );
        }
      } catch (piErr) {
        bookingWarn("create-payment-intent", "failed to retrieve existing PI, creating new one", { holdId: input.holdId, existingPiId });
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

    // Idempotency key includes chargeCents so replacement intents after amount mismatch use a different key
    // and cannot replay a stale Stripe response; fast-path above only reuses when amount and secret are valid.
    const idempotencyKey = `pi-${input.holdId}-${payFullAmount ? "full" : "deposit"}-${chargeCents}`;
    bookingLog("create-payment-intent", "creating new PaymentIntent", {
      holdId: input.holdId,
      chargeCents,
      payFullAmount,
      idempotencyKey: idempotencyKey.slice(0, 50) + "...",
    });
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: chargeCents,
        currency: "usd",
        customer: customerId,
        automatic_payment_methods: { enabled: true },
        setup_future_usage: "off_session",
        metadata,
      },
      { idempotencyKey }
    );
    if (!paymentIntent.client_secret) {
      bookingError("create-payment-intent", "PaymentIntent missing client secret", null, { paymentIntentId: paymentIntent.id });
      return NextResponse.json({ error: "PaymentIntent missing client secret" }, { status: 500 });
    }
    // Persist the PI id on the hold so retries can reuse it instead of creating a new charge.
    await holdRef.update(
      payFullAmount ? { fullPaymentIntentId: paymentIntent.id } : { depositPaymentIntentId: paymentIntent.id }
    );
    bookingLog("create-payment-intent", "PaymentIntent created and persisted", {
      holdId: input.holdId,
      paymentIntentId: paymentIntent.id,
      payFullAmount,
    });
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
    bookingError("create-payment-intent", "create payment intent failed", err, { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
