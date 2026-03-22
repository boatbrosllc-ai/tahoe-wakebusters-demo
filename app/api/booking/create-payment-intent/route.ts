import type { Firestore } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { checkRateLimit, getClientKey } from "@/lib/booking/rate-limit";
import type { Hold, Experience } from "@/lib/booking/types";
import { bookingLog, bookingWarn, bookingError, redactEmail, generateIncidentCode } from "@/lib/booking/debug";
import { hasReleaseTokenSecret, verifyReleaseToken } from "@/lib/booking/releaseToken";
import { resolveHoldBookingPricing } from "@/lib/booking/hold-charge-resolver";
import { signReceiptClaimToken } from "@/lib/booking/receiptToken";
import { DEPOSIT_FRACTION, HOLD_PAYMENT_ATTEMPT_VERSION_META } from "@/lib/booking/constants";

/** Extend hold by this many minutes when creating payment intent so card-entry/SCA time does not invalidate conversion. */
const HOLD_EXPIRY_EXTENSION_MINUTES = 30;
/** Must match create-hold `HOLD_EXPIRY_MINUTES` — caps absolute hold wall time when combining initial hold + one PI extension. */
const HOLD_INITIAL_EXPIRY_MINUTES = 10;
const MAX_HOLD_LIFETIME_FROM_CREATED_MS =
  (HOLD_INITIAL_EXPIRY_MINUTES + HOLD_EXPIRY_EXTENSION_MINUTES) * 60 * 1000;

function parseBody(body: unknown): { holdId: string; payFullAmount: boolean; release_token?: string } | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const holdId = typeof o.holdId === "string" ? o.holdId : null;
  if (!holdId) return null;
  // Default to deposit (false): only charge full when client explicitly sends payFullAmount: true
  const payFullAmount = o.payFullAmount === true;
  const release_token = typeof o.release_token === "string" ? o.release_token.trim() : undefined;
  return { holdId, payFullAmount, ...(release_token ? { release_token } : {}) };
}

/** Ensure Stripe Customer exists; use stripeCustomerIndex by email (no Stripe list by email).
 * Uses Firestore document create() as compare-and-set so exactly one stripe.customers.create() runs per email under concurrency.
 * Self-healing: pending records use a lease/expiry; stale or recoverable-error entries are cleared so retries can proceed.
 * PENDING_LOCK_LEASE_SEC bounds how long another request may hold the index lock; polling must run at least that long
 * so we do not return 503 while the lock is still legitimately held. */
const PENDING_LOCK_LEASE_SEC = 10;
const POLL_MAX_ITERATIONS = 30;
const POLL_BASE_DELAY_MS = 200;
const POLL_MAX_ELAPSED_MS = PENDING_LOCK_LEASE_SEC * 1000;

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
      const remaining = POLL_MAX_ELAPSED_MS - (Date.now() - pollStart);
      const delay = Math.min(
        POLL_BASE_DELAY_MS * (1 << i) + Math.random() * 100,
        Math.max(0, remaining),
      );
      await new Promise((r) => setTimeout(r, delay));
      if (Date.now() - pollStart > POLL_MAX_ELAPSED_MS) {
        const retriable = new Error("Stripe customer index poll timeout") as Error & { retriable?: boolean };
        retriable.retriable = true;
        throw retriable;
      }
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

  // After lock takeover, re-read in case the previous holder already created the customer.
  const reSnap = await indexRef.get();
  const reData = reSnap.exists ? (reSnap.data() as { customerId?: string | null }) : null;
  if (reData?.customerId) return reData.customerId;

  try {
    const displayEmail = email.trim();
    const customer = await stripe.customers.create({
      email: email.trim().toLowerCase(),
      name: name.trim() || undefined,
      phone: phone.trim() || undefined,
      metadata: { emailLower, displayEmail },
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
    if (hasReleaseTokenSecret()) {
      if (!input.release_token) {
        return NextResponse.json(
          { error: "release_token required (returned from create-hold with this hold)" },
          { status: 401 }
        );
      }
      const rel = verifyReleaseToken(input.release_token);
      if (!rel || rel.holdId !== input.holdId) {
        return NextResponse.json({ error: "Invalid or expired release link" }, { status: 401 });
      }
    }
    if (hold.status !== "active") {
      bookingLog("create-payment-intent", "hold not active", { holdId: input.holdId, status: hold.status });
      return NextResponse.json({ error: "Hold expired or already used" }, { status: 400 });
    }
    const expiresAt = hold.expiresAt as { toDate(): Date };
    if (expiresAt.toDate() < new Date()) {
      bookingLog("create-payment-intent", "hold expired", { holdId: input.holdId, expiresAt: expiresAt.toDate().toISOString() });
      return NextResponse.json({ error: "Hold expired" }, { status: 400 });
    }
    let pricing: import("@/lib/booking/types").BookingPricing;
    try {
      const resolved = await resolveHoldBookingPricing(db, hold, { mode: "payment_intent" });
      pricing = resolved.pricing;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "RATE_NOT_FOUND") return NextResponse.json({ error: "Rate not found" }, { status: 404 });
      if (msg === "BOAT_NOT_FOUND") return NextResponse.json({ error: "Boat not found" }, { status: 404 });
      throw e;
    }
    const tipCents = (hold as { tipCents?: number }).tipCents ?? 0;
    const discountCents = (hold as { discountCents?: number }).discountCents ?? 0;
    const totalCents = Math.max(0, pricing.totalCents + tipCents - discountCents);
    const depositCents = Math.round(totalCents * DEPOSIT_FRACTION);
    const finalCents = totalCents - depositCents;
    // Shared ticketed experiences always charge full — no deposit option.
    let payFullAmount: boolean;
    if ((hold as { bookingMode?: string }).bookingMode === "shared") {
      payFullAmount = true;
    } else if (hold.experienceId && input.payFullAmount === false) {
      try {
        const expSnap = await db.collection("experiences").doc(hold.experienceId).get();
        const experience = expSnap.exists ? (expSnap.data() as Experience) : null;
        // Charter requires explicit allowDeposit === true in Firestore (match experience-detail API)
        if (experience && experience.allowDeposit === true) {
          payFullAmount = false;
        } else {
          payFullAmount = true;
          if (!experience) {
            bookingWarn("create-payment-intent", "deposit coerced to full: experience not found", { holdId: input.holdId, experienceId: hold.experienceId });
          } else {
            bookingWarn("create-payment-intent", "deposit coerced to full: allowDeposit disabled or not set", { holdId: input.holdId, experienceId: hold.experienceId });
          }
        }
      } catch (fetchErr) {
        payFullAmount = true;
        bookingWarn("create-payment-intent", "deposit coerced to full: experience fetch failed", { holdId: input.holdId, experienceId: hold.experienceId, err: fetchErr });
      }
    } else {
      payFullAmount = input.payFullAmount;
    }
    const chargeCents = payFullAmount ? totalCents : depositCents;
    const isOneTimeTicketed = (hold as { bookingMode?: string }).bookingMode === "shared" && payFullAmount === true;
    bookingLog("create-payment-intent", "pricing", {
      holdId: input.holdId,
      payFullAmount,
    });

    const { Timestamp, FieldValue } = getFirestoreExports();
    type MergeTxResult =
      | { ok: false; code: "not_found" | "inactive" | "expired" }
      | {
          ok: true;
          effectiveExpiresAt: Date;
          holdExtendedForPayment: boolean;
          otherIdToCancel?: string;
        };

    const mergeOutcome: MergeTxResult = await db.runTransaction(async (tx): Promise<MergeTxResult> => {
      const snap = await tx.get(holdRef);
      if (!snap.exists) return { ok: false, code: "not_found" };
      const h = snap.data() as Hold & {
        paymentIntentExpiryExtendedAt?: { toDate(): Date };
        depositPaymentIntentId?: string;
        fullPaymentIntentId?: string;
      };
      if (h.status !== "active") return { ok: false, code: "inactive" };
      const exp = (h.expiresAt as { toDate(): Date }).toDate();
      const now = new Date();
      if (exp < now) return { ok: false, code: "expired" };

      const otherField = payFullAmount ? "depositPaymentIntentId" : "fullPaymentIntentId";
      const otherIdRaw = (payFullAmount ? h.depositPaymentIntentId : h.fullPaymentIntentId)?.trim();

      const alreadyExtended = h.paymentIntentExpiryExtendedAt != null;
      let effectiveExpiresAt = exp;
      let holdExtendedForPayment = false;
      const updates: Record<string, unknown> = {};

      if (!alreadyExtended) {
        const createdRaw = h.createdAt as { toDate(): Date } | undefined;
        const createdMs = createdRaw && typeof createdRaw.toDate === "function" ? createdRaw.toDate().getTime() : now.getTime();
        const maxEnd = new Date(createdMs + MAX_HOLD_LIFETIME_FROM_CREATED_MS);
        let next = new Date(now.getTime() + HOLD_EXPIRY_EXTENSION_MINUTES * 60 * 1000);
        if (next > maxEnd) next = maxEnd;
        if (next <= now) return { ok: false, code: "expired" };
        effectiveExpiresAt = next;
        holdExtendedForPayment = true;
        updates.expiresAt = Timestamp.fromDate(next);
        updates.paymentIntentExpiryExtendedAt = Timestamp.now();
      }
      if (otherIdRaw) {
        updates[otherField] = FieldValue.delete();
      }
      if (Object.keys(updates).length > 0) {
        tx.update(holdRef, updates);
      }
      return { ok: true, effectiveExpiresAt, holdExtendedForPayment, otherIdToCancel: otherIdRaw };
    });

    if (!mergeOutcome.ok) {
      if (mergeOutcome.code === "not_found") {
        return NextResponse.json({ error: "Hold not found" }, { status: 404 });
      }
      bookingLog("create-payment-intent", "hold no longer valid in extension transaction", {
        holdId: input.holdId,
        code: mergeOutcome.code,
      });
      return NextResponse.json(
        { error: mergeOutcome.code === "expired" ? "Hold expired" : "Hold expired or already used" },
        { status: 400 }
      );
    }

    const newExpiresAt = mergeOutcome.effectiveExpiresAt;
    const holdExtendedForPayment = mergeOutcome.holdExtendedForPayment;
    if (holdExtendedForPayment) {
      bookingLog("create-payment-intent", "hold expiry extended (first PI extension)", {
        holdId: input.holdId,
        newExpiresAt: newExpiresAt.toISOString(),
      });
    } else {
      bookingLog("create-payment-intent", "hold expiry not extended (PI retry; already extended once)", {
        holdId: input.holdId,
        effectiveExpiresAt: newExpiresAt.toISOString(),
      });
    }

    const receiptClaimToken = signReceiptClaimToken(input.holdId) ?? undefined;

    const stripe = getStripe();
    if (mergeOutcome.otherIdToCancel) {
      try {
        const otherPi = await stripe.paymentIntents.retrieve(mergeOutcome.otherIdToCancel);
        if (otherPi.status !== "succeeded" && otherPi.status !== "canceled") {
          await stripe.paymentIntents.cancel(mergeOutcome.otherIdToCancel).catch(() => {});
        }
        bookingLog("create-payment-intent", "canceled opposite preconversion PI (field cleared in hold transaction)", {
          holdId: input.holdId,
          payFullAmount,
        });
      } catch (oppErr) {
        bookingWarn("create-payment-intent", "failed to cancel opposite preconversion PI (continuing)", {
          holdId: input.holdId,
          err: oppErr,
        });
      }
    }

    const customerId = await getOrCreateStripeCustomer(
      db,
      stripe,
      hold.customerDraft.email,
      hold.customerDraft.name,
      hold.customerDraft.phone
    );

    const holdSnapAfterOpposite = await holdRef.get();
    const holdForPi = holdSnapAfterOpposite.exists ? (holdSnapAfterOpposite.data() as Hold) : hold;
    const holdPaymentAttemptVersion =
      typeof holdForPi.paymentAttemptVersion === "number" ? holdForPi.paymentAttemptVersion : 1;

    // Reuse an existing active PaymentIntent for this hold+stage to prevent duplicate charges.
    // Validate amount matches current chargeCents; if not, cancel/replace and persist new id so we never charge a stale amount.
    const existingPiId = payFullAmount ? holdForPi.fullPaymentIntentId : holdForPi.depositPaymentIntentId;
    if (existingPiId) {
      try {
        bookingLog("create-payment-intent", "checking existing PI", { holdId: input.holdId, existingPiIdPrefix: existingPiId.slice(0, 8), payFullAmount });
        const existing = await stripe.paymentIntents.retrieve(existingPiId);
        if (existing.status !== "canceled" && existing.status !== "succeeded") {
          const expectedStage = payFullAmount ? "full" : "deposit";
          const metaStage = existing.metadata?.payment_stage;
          if (metaStage && metaStage !== expectedStage) {
            bookingLog("create-payment-intent", "existing PI payment_stage mismatch, canceling", {
              holdId: input.holdId,
              metaStage,
              expectedStage,
            });
            if (existing.status === "requires_payment_method" || existing.status === "requires_confirmation") {
              await stripe.paymentIntents.cancel(existingPiId).catch(() => {});
            }
            const { FieldValue } = getFirestoreExports();
            await holdRef.update(
              payFullAmount ? { fullPaymentIntentId: FieldValue.delete() } : { depositPaymentIntentId: FieldValue.delete() }
            );
          } else {
          const metaVer = existing.metadata?.[HOLD_PAYMENT_ATTEMPT_VERSION_META];
          if (metaVer !== String(holdPaymentAttemptVersion)) {
            bookingLog("create-payment-intent", "existing PI payment attempt version mismatch, canceling", {
              holdId: input.holdId,
              metaVer: metaVer ?? null,
              holdPaymentAttemptVersion,
            });
            if (existing.status === "requires_payment_method" || existing.status === "requires_confirmation") {
              await stripe.paymentIntents.cancel(existingPiId).catch(() => {});
            }
            const { FieldValue } = getFirestoreExports();
            await holdRef.update(
              payFullAmount ? { fullPaymentIntentId: FieldValue.delete() } : { depositPaymentIntentId: FieldValue.delete() }
            );
          } else {
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
              holdExtendedForPayment,
              ...(!holdExtendedForPayment
                ? {
                    holdExpiryNote:
                      "Your hold time was not extended again. Complete payment before it expires, or start over to pick a new time.",
                  }
                : {}),
              ...(typeof hold.effectiveRateCents === "number" ? { effectiveRateCents: hold.effectiveRateCents } : {}),
              ...(receiptClaimToken ? { receiptClaimToken } : {}),
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
          }
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
      [HOLD_PAYMENT_ATTEMPT_VERSION_META]: String(holdPaymentAttemptVersion),
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
    const paymentIntentParams: Parameters<typeof stripe.paymentIntents.create>[0] = {
      amount: chargeCents,
      currency: "usd",
      customer: customerId,
      metadata,
    };
    if (isOneTimeTicketed) {
      paymentIntentParams.automatic_payment_methods = { enabled: true };
    } else if (payFullAmount === false) {
      // Deposit: save card for off-session use.
      paymentIntentParams.payment_method_types = ["card"];
      paymentIntentParams.setup_future_usage = "off_session";
    } else {
      // Full-payment charter: accept Apple Pay / Google Pay and do not retain card.
      paymentIntentParams.automatic_payment_methods = { enabled: true };
    }
    const paymentIntent = await stripe.paymentIntents.create(
      paymentIntentParams,
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
      holdExtendedForPayment,
      ...(!holdExtendedForPayment
        ? {
            holdExpiryNote:
              "Your hold time was not extended again. Complete payment before it expires, or start over to pick a new time.",
          }
        : {}),
      ...(typeof hold.effectiveRateCents === "number" ? { effectiveRateCents: hold.effectiveRateCents } : {}),
      ...(receiptClaimToken ? { receiptClaimToken } : {}),
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
