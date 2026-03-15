import type { Firestore } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { buildAddonSelectionsForPricing, computePricing, getEffectiveRatePriceCents } from "@/lib/booking/pricing";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";
import type { Hold, Rate, Addon, Experience } from "@/lib/booking/types";
import type { ExperienceRate, ExperienceAddon, BoatRate, ListingBoat } from "@/lib/booking/types";
import { bookingLog, bookingWarn, bookingError, redactEmail, generateIncidentCode } from "@/lib/booking/debug";

/** Extend hold by this many minutes when creating payment intent so card-entry/SCA time does not invalidate conversion. */
const HOLD_EXPIRY_EXTENSION_MINUTES = 10;

function parseBody(body: unknown): { holdId: string; payFullAmount: boolean } | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const holdId = typeof o.holdId === "string" ? o.holdId : null;
  if (!holdId) return null;
  // Default to deposit (false): only charge full when client explicitly sends payFullAmount: true
  const payFullAmount = o.payFullAmount === true;
  return { holdId, payFullAmount };
}

/** Ensure Stripe Customer exists; use stripeCustomerIndex by email (no Stripe list by email).
 * Uses Firestore document create() as compare-and-set so exactly one stripe.customers.create() runs per email under concurrency.
 * Self-healing: pending records use a lease/expiry; stale or recoverable-error entries are cleared so retries can proceed.
 * PENDING_LOCK_LEASE_SEC is short (15–20s) so lock takeover completes within a single request; polling uses more iterations
 * with shorter delays and ~3s max so the loop is more likely to see the lock expire and take over instead of surfacing 503. */
const PENDING_LOCK_LEASE_SEC = 18;
const POLL_MAX_ITERATIONS = 6;
const POLL_BASE_DELAY_MS = 200;
const POLL_MAX_ELAPSED_MS = 3000;

type TakeoverResult = { action: "done"; customerId: string } | { action: "tookOver" } | { action: "retry" };

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
  const now = new Date();
  const leaseEnd = new Date(now.getTime() + PENDING_LOCK_LEASE_SEC * 1000);

  const releaseLockOnError = async (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    await indexRef.update({
      pending: false,
      recoverableError: {
        message: message.slice(0, 500),
        at: Timestamp.now(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    }).catch((updateErr) => {
      bookingWarn("create-payment-intent", "failed to release stripe customer index lock", { emailRedacted: redactEmail(emailLower), updateErr });
    });
  };

  try {
    await indexRef.create({
      customerId: null,
      pending: true,
      pendingLockExpiresAt: Timestamp.fromDate(leaseEnd),
      createdAt: Timestamp.now(),
    });
  } catch (createErr: unknown) {
    const err = createErr as { code?: number | string };
    const isAlreadyExists = err?.code === 6 || err?.code === "already-exists";
    if (!isAlreadyExists) throw createErr;

    const pollStart = Date.now();
    let tookOver = false;
    for (let i = 0; i < POLL_MAX_ITERATIONS; i++) {
      if (Date.now() - pollStart > POLL_MAX_ELAPSED_MS) {
        const retriable = new Error("Stripe customer index poll timeout") as Error & { retriable?: boolean };
        retriable.retriable = true;
        throw retriable;
      }
      const result = await db.runTransaction(async (tx): Promise<TakeoverResult> => {
        const snap = await tx.get(indexRef);
        const data = snap.exists
          ? (snap.data() as {
              customerId?: string | null;
              pending?: boolean;
              pendingLockExpiresAt?: { toDate(): Date };
              recoverableError?: { message?: string; at?: unknown };
            })
          : null;
        if (data?.customerId) return { action: "done", customerId: data.customerId };
        const expiresAt = data?.pendingLockExpiresAt;
        const lockExpired =
          !expiresAt || (typeof expiresAt.toDate === "function" && expiresAt.toDate() < new Date());
        const hasRecoverableError = !!data?.recoverableError;
        const canTakeOver = !data?.pending || lockExpired || hasRecoverableError;
        if (!canTakeOver) return { action: "retry" };
        tx.update(indexRef, {
          pending: true,
          pendingLockExpiresAt: Timestamp.fromDate(
            new Date(Date.now() + PENDING_LOCK_LEASE_SEC * 1000)
          ),
          recoverableError: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { action: "tookOver" };
      });
      if (result.action === "done") return result.customerId;
      if (result.action === "tookOver") {
        console.warn("[booking:create-payment-intent] stripe customer index lock takeover", {
          emailRedacted: emailLower.slice(0, 2) + "***",
        });
        tookOver = true;
        break;
      }
      await new Promise((r) => setTimeout(r, POLL_BASE_DELAY_MS * (i + 1)));
    }

    if (!tookOver) {
      const snap = await indexRef.get();
      const data = snap.exists ? (snap.data() as { customerId?: string | null }) : null;
      if (data?.customerId) return data.customerId;
      const retriable = new Error("Stripe customer index race: customerId not set in time") as Error & {
        retriable?: boolean;
      };
      retriable.retriable = true;
      throw retriable;
    }
  }

  try {
    const customer = await stripe.customers.create({
      email: email.trim(),
      name: name.trim() || undefined,
      phone: phone.trim() || undefined,
      metadata: { emailLower },
    });
    await indexRef.update({
      customerId: customer.id,
      pending: false,
      pendingLockExpiresAt: FieldValue.delete(),
      recoverableError: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return customer.id;
  } catch (stripeErr) {
    await releaseLockOnError(stripeErr);
    throw stripeErr;
  }
}

export async function POST(request: NextRequest) {
  try {
    bookingLog("create-payment-intent", "request started");
    const rl = await checkRateLimit(getClientKey(request));
    if (!rl.allowed) {
      if (rl.serverError) {
        const incidentCode = generateIncidentCode();
        bookingWarn("create-payment-intent", "rate limit service unavailable (503)", {
          incidentCode,
          reason: "Redis unavailable or timeout; RATE_LIMIT_FAIL_CLOSED=1",
        });
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
      bookingLog("create-payment-intent", "invalid body: holdId required");
      return NextResponse.json({ error: "holdId required" }, { status: 400 });
    }
    bookingLog("create-payment-intent", "parsed input", { holdId: input.holdId, payFullAmount: input.payFullAmount });
    let db: ReturnType<typeof getDb>;
    try {
      db = getDb();
    } catch (configErr) {
      const msg = configErr instanceof Error ? configErr.message : String(configErr);
      const isConfig = /Firebase config missing|FIREBASE_PRIVATE_KEY|Missing required env/i.test(msg);
      const incidentCode = generateIncidentCode();
      bookingWarn("create-payment-intent", "config error (503)", {
        incidentCode,
        message: msg,
        hint: isConfig ? "Set FIREBASE_* and STRIPE_SECRET_KEY in deployment (see docs/BOOKING_SETUP.md)." : "Service config missing or invalid.",
      });
      return NextResponse.json(
        { error: "Service temporarily unavailable. Please try again shortly.", incidentCode },
        { status: 503 }
      );
    }
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
    // Extend hold expiry atomically so card-entry/SCA time does not invalidate conversion.
    const { Timestamp } = getFirestoreExports();
    const newExpiresAt = new Date(Date.now() + HOLD_EXPIRY_EXTENSION_MINUTES * 60 * 1000);
    await holdRef.update({ expiresAt: Timestamp.fromDate(newExpiresAt) });
    bookingLog("create-payment-intent", "hold expiry extended", { holdId: input.holdId, newExpiresAt: newExpiresAt.toISOString() });
    const hasExperience = !!hold.experienceId;
    const hasBoat = !!hold.boatId;
    const isListingBoatFlow = hasExperience && hasBoat;
    const isSharedTicketed = (hold as { bookingMode?: string }).bookingMode === "shared";
    // Use hold's stored pricing when available (charter or shared ticketed). For shared ticketed, the hold was
    // created with the correct party size, so using hold.pricing avoids recomputation bugs (e.g. partySize type/read).
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
      // Ticketed (shared) experiences: price is per ticket, so multiply by partySize.
      const ticketQty =
        (hold as { bookingMode?: string }).bookingMode === "shared"
          ? Math.max(1, Math.floor(Number(hold.partySize ?? 1)))
          : 1;
      pricing = computePricing({ rate: rateForPricing, addons: addonsForPricing, currency: "usd", qty: ticketQty });
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
      payFullAmount,
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
        bookingLog("create-payment-intent", "checking existing PI", { holdId: input.holdId, existingPiIdPrefix: existingPiId.slice(0, 8), payFullAmount });
        const existing = await stripe.paymentIntents.retrieve(existingPiId);
        if (existing.status !== "canceled" && existing.status !== "succeeded") {
          const existingAmount = existing.amount;
          if (existingAmount === chargeCents && existing.client_secret) {
            bookingLog("create-payment-intent", "reusing existing PI", { holdId: input.holdId, paymentIntentIdPrefix: existing.id.slice(0, 8) });
            return NextResponse.json({
              clientSecret: existing.client_secret,
              paymentIntentId: existing.id,
              depositCents: payFullAmount ? totalCents : depositCents,
              finalCents: payFullAmount ? 0 : finalCents,
              totalCents,
              payFullAmount,
              expiresAt: newExpiresAt.toISOString(),
            });
          }
          // Amount mismatch or missing secret: cancel stale intent so we create a fresh one with correct amount.
          bookingLog("create-payment-intent", "existing PI stale (amount mismatch or no secret), creating new", {
            holdId: input.holdId,
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
        bookingWarn("create-payment-intent", "failed to retrieve existing PI, creating new one", { holdId: input.holdId, existingPiIdPrefix: existingPiId.slice(0, 8) });
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
      payFullAmount,
    });
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: chargeCents,
        currency: "usd",
        customer: customerId,
        payment_method_types: ["card"],
        setup_future_usage: "off_session",
        metadata,
      },
      { idempotencyKey }
    );
    if (!paymentIntent.client_secret) {
      bookingError("create-payment-intent", "PaymentIntent missing client secret", null, { paymentIntentIdPrefix: paymentIntent.id.slice(0, 8) });
      return NextResponse.json({ error: "PaymentIntent missing client secret" }, { status: 500 });
    }
    // Persist the PI id on the hold so retries can reuse it instead of creating a new charge.
    await holdRef.update(
      payFullAmount ? { fullPaymentIntentId: paymentIntent.id } : { depositPaymentIntentId: paymentIntent.id }
    );
    bookingLog("create-payment-intent", "PaymentIntent created and persisted", {
      holdId: input.holdId,
      paymentIntentIdPrefix: paymentIntent.id.slice(0, 8),
      payFullAmount,
    });
    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      depositCents: payFullAmount ? totalCents : depositCents,
      finalCents: payFullAmount ? 0 : finalCents,
      totalCents,
      payFullAmount,
      expiresAt: newExpiresAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create payment intent failed";
    const isConfig = /Firebase config missing|FIREBASE_PRIVATE_KEY|Missing required env|STRIPE_SECRET_KEY/i.test(message);
    const isRetriable = err instanceof Error && (err as { retriable?: boolean }).retriable === true;
    const incidentCode = generateIncidentCode();
    bookingError("create-payment-intent", "create payment intent failed", err, {
      message,
      incidentCode,
      hint: isConfig ? "Set Firebase and Stripe env vars in deployment (see docs/BOOKING_SETUP.md)." : undefined,
    });
    if (isRetriable) {
      return NextResponse.json(
        { error: "Payment is temporarily unavailable. Please try again in a moment.", incidentCode },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        error: isConfig ? "Service temporarily unavailable. Please try again shortly." : "Payment is temporarily unavailable. Please try again.",
        incidentCode,
      },
      { status: isConfig ? 503 : 500 }
    );
  }
}
