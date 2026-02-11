import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { getStripe, buildLineItems } from "@/lib/booking/stripe-client";
import { buildAddonSelectionsForPricing, computePricing } from "@/lib/booking/pricing";
import { bookingEnv } from "@/lib/booking/env";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";
import type { Experience, ExperienceRate, ExperienceAddon, Slot } from "@/lib/booking/types";

const HOLD_EXPIRY_MINUTES = 10;

/** Placeholder customer for direct checkout; Stripe collects real details. */
const PLACEHOLDER_CUSTOMER = {
  name: "Checkout",
  email: "checkout@pending.local",
  phone: "+15555555555",
};

function parseBody(body: unknown): { experienceId: string; slotId: string; partySize: number; petsCount: number } | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const experienceId = typeof o.experienceId === "string" ? o.experienceId : null;
  const slotId = typeof o.slotId === "string" ? o.slotId : null;
  if (!experienceId || !slotId) return null;
  const partySize = typeof o.partySize === "number" ? o.partySize : 1;
  const petsCount = typeof o.petsCount === "number" ? o.petsCount : 0;
  return { experienceId, slotId, partySize, petsCount };
}

function isSeasonalAllowed(exp: Experience, slotStart: Date): boolean {
  if (!exp.seasonal?.enabled) return true;
  const startMonth = exp.seasonal.startMonth ?? 1;
  const endMonth = exp.seasonal.endMonth ?? 12;
  const month = slotStart.getMonth() + 1;
  if (startMonth <= endMonth) return month >= startMonth && month <= endMonth;
  return month >= startMonth || month <= endMonth;
}

export async function POST(request: NextRequest) {
  try {
    const rl = checkRateLimit(getClientKey(request));
    if (!rl.allowed) {
      const retryAfter = rl.retryAfterMs ? Math.ceil(rl.retryAfterMs / 1000) : 60;
      return NextResponse.json(
        { error: "Too many requests. Please try again in a moment." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
    const body = await request.json();
    const input = parseBody(body);
    if (!input) {
      return NextResponse.json({ error: "experienceId and slotId required" }, { status: 400 });
    }

    const parsed = parseSlotId(input.slotId);
    if (!parsed) {
      return NextResponse.json({ error: "Invalid slotId" }, { status: 400 });
    }

    const db = getDb();
    const { FieldValue, Timestamp } = getFirestoreExports();

    const expDoc = await db.collection("experiences").doc(input.experienceId).get();
    if (!expDoc.exists) {
      return NextResponse.json({ error: "Experience not found" }, { status: 404 });
    }
    const experience = expDoc.data() as Experience;
    if (!experience.active) {
      return NextResponse.json({ error: "Experience not available" }, { status: 400 });
    }
    if (input.partySize > experience.maxGuests) {
      return NextResponse.json({ error: "Party size exceeds maximum" }, { status: 400 });
    }
    if (input.petsCount > experience.petsMax) {
      return NextResponse.json({ error: "Pets exceed maximum" }, { status: 400 });
    }

    const ratesSnap = await db
      .collection("experiences")
      .doc(input.experienceId)
      .collection("rates")
      .where("active", "==", true)
      .get();
    const rateDoc = ratesSnap.docs.find((d) => (d.data() as ExperienceRate).durationHours === parsed.durationHours);
    if (!rateDoc) {
      return NextResponse.json({ error: "No rate found for this slot duration" }, { status: 404 });
    }
    const rateId = rateDoc.id;
    const rate = rateDoc.data() as ExperienceRate;

    const slotRef = db.collection("experiences").doc(input.experienceId).collection("slots").doc(input.slotId);
    const slotDoc = await slotRef.get();
    let slotStart: Date;
    if (slotDoc.exists) {
      const slotData = slotDoc.data() as Slot;
      slotStart = (slotData.startAt as { toDate(): Date }).toDate();
      if (slotData.status !== "open") {
        return NextResponse.json({ error: "Slot no longer available" }, { status: 409 });
      }
    } else {
      slotStart = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours).start;
    }
    if (!isSeasonalAllowed(experience, slotStart)) {
      return NextResponse.json({ error: "Experience not available for this date" }, { status: 400 });
    }

    const addonsSnap = await db
      .collection("experiences")
      .doc(input.experienceId)
      .collection("addons")
      .get();
    const addonsById = new Map<string, ExperienceAddon>();
    addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as ExperienceAddon));
    const addonsForPricing = buildAddonSelectionsForPricing([], addonsById);
    const pricing = computePricing({ rate, addons: addonsForPricing, currency: "usd" });

    const holdId = db.collection("holds").doc().id;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + HOLD_EXPIRY_MINUTES * 60 * 1000);
    const holdPayload = {
      experienceId: input.experienceId,
      slotId: input.slotId,
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

    await db.runTransaction(async (tx) => {
      const slotSnap = await tx.get(slotRef);
      if (slotSnap.exists) {
        const slot = slotSnap.data() as Slot;
        if (slot.status !== "open") throw new Error("Slot no longer available");
        tx.update(slotRef, {
          status: "held",
          holdId,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        const { start: slotStartDate, end: slotEndDate } = getSlotStartEnd(
          parsed.dateStr,
          parsed.startHour,
          parsed.durationHours
        );
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
      rate,
      addons: addonsForPricing,
      hold: hold as import("@/lib/booking/types").Hold,
    });
    const baseUrl = bookingEnv.appBaseUrl;
    const stripe = getStripe();
    const metadata: Record<string, string> = {
      holdId,
      slotId: input.slotId,
      rateId,
      experienceId: input.experienceId,
    };
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      customer_email: undefined,
      phone_number_collection: { enabled: true },
      custom_fields: [
        { key: "special_notes", label: { type: "custom", custom: "Special requests (optional)" }, type: "text" },
      ],
      metadata,
      success_url: `${baseUrl}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/booking/cancel?holdId=${holdId}`,
    });

    if (session.url) {
      await db.collection("holds").doc(holdId).update({ checkoutSessionId: session.id });
      return NextResponse.json({ url: session.url, sessionId: session.id });
    }
    return NextResponse.json({ error: "Checkout session failed" }, { status: 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Direct checkout failed";
    if (message === "Slot no longer available") {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("[create-checkout-session-direct]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
