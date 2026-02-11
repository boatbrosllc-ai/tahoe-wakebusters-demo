import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { buildAddonSelectionsForPricing, computePricing } from "@/lib/booking/pricing";
import type { Hold, Rate, Addon } from "@/lib/booking/types";
import type { ExperienceRate, ExperienceAddon, BoatRate } from "@/lib/booking/types";

function parseBody(body: unknown): { holdId: string } | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const holdId = typeof o.holdId === "string" ? o.holdId : null;
  if (!holdId) return null;
  return { holdId };
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
    let rate: Rate | ExperienceRate | BoatRate;
    const addonsById = new Map<string, Addon | ExperienceAddon>();
    if (isListingBoatFlow) {
      const rateSnap = await db.collection("boats").doc(hold.boatId!).collection("rates").doc(hold.rateId).get();
      if (!rateSnap.exists) return NextResponse.json({ error: "Rate not found" }, { status: 404 });
      rate = rateSnap.data() as BoatRate;
      const addonsSnap = await db.collection("experiences").doc(hold.experienceId!).collection("addons").get();
      addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as ExperienceAddon));
    } else if (hasExperience) {
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
    const pricing = computePricing({ rate, addons: addonsForPricing, currency: "usd" });
    const tipCents = (hold as { tipCents?: number }).tipCents ?? 0;
    const totalCents = pricing.totalCents + tipCents;
    const stripe = getStripe();
    const metadata: Record<string, string> = {
      holdId: input.holdId,
      slotId: hold.slotId,
      rateId: hold.rateId,
    };
    if (hold.experienceId) metadata.experienceId = hold.experienceId;
    if (hold.boatId) metadata.boatId = hold.boatId;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata,
    });
    if (!paymentIntent.client_secret) {
      return NextResponse.json({ error: "PaymentIntent missing client secret" }, { status: 500 });
    }
    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create payment intent failed";
    console.error("[create-payment-intent]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
