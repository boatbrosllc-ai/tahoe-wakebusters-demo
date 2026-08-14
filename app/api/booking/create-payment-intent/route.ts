import type { Firestore } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getStripe } from "@/lib/booking/stripe-client";
import { checkRateLimitSensitiveMutation, getClientKey } from "@/lib/booking/rate-limit";
import type { Hold, Experience } from "@/lib/booking/types";
import { bookingLog, bookingWarn, bookingError, redactEmail, generateIncidentCode } from "@/lib/booking/debug";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import {
  hasReleaseTokenSecret,
  signReleaseToken,
  verifyReleaseToken,
  verifyReleaseTokenIgnoreExpiry,
} from "@/lib/booking/releaseToken";
import { resolveHoldBookingPricing } from "@/lib/booking/hold-charge-resolver";
import { signReceiptClaimToken } from "@/lib/booking/receiptToken";
import { DEPOSIT_FRACTION, HOLD_PAYMENT_ATTEMPT_VERSION_META } from "@/lib/booking/constants";
import { buildPaymentIntentIdempotencyKey } from "@/lib/booking/stripe-idempotency-keys";
import { HOLD_CHECKOUT_SESSION_EXTENSION_MINUTES, MAX_HOLD_LIFETIME_FROM_CREATED_MS } from "@/lib/booking/hold-expiry";
import { computeFinalChargeTotalCentsFromHoldPricing } from "@/lib/booking/hold-pricing-final-total";
import { attachHoldReleaseCookie } from "@/lib/booking/hold-release-cookie";
import { bookingNotReadyResponse, legacyFallbackUnsafeResponse } from "@/lib/booking/booking-readiness-response";
import { assertReceiptTokenSecretConfigured } from "@/lib/booking/receipt-token-secret";
import { verifyIndexedStripeCustomerOrClear } from "@/lib/booking/stripe-customer-index";
import { buildBookingPaymentIntentMethodParams } from "@/lib/booking/payment-intent-methods";
import { parseSlotIdRelaxed, parseSlotId, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { isDepositEligibleByLeadTime } from "@/lib/booking/final-charge-at";
import { getDepositLeadTimeHours, shouldForceFullPaymentAtCheckout } from "@/lib/booking/customer-operations";

/** Re-sign after optional hold extension so the client can cancel/back after the original create-hold window. */
function releaseTokenFieldForResponse(holdId: string, effectiveExpiresAt: Date): { releaseToken: string } | Record<string, never> {
  if (!hasReleaseTokenSecret()) return {};
  const t = signReleaseToken(holdId, Math.floor(effectiveExpiresAt.getTime() / 1000));
  return t ? { releaseToken: t } : {};
}

function parseBody(body: unknown): { holdId: string; release_token?: string; clientPayFullAmount: boolean } | null {
  if (body == null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const holdId = typeof o.holdId === "string" ? o.holdId : null;
  if (!holdId) return null;
  const release_token = typeof o.release_token === "string" ? o.release_token.trim() : undefined;
  const payFullAmount = o.payFullAmount === true;
  return { holdId, clientPayFullAmount: payFullAmount, ...(release_token ? { release_token } : {}) };
}

/** Ensure Stripe Customer exists; use stripeCustomerIndex by email (no Stripe list by email).
 * Uses Firestore document create() as compare-and-set so exactly one stripe.customers.create() runs per email under concurrency.
 * Self-healing: pending records use a lease/expiry; stale or recoverable-error entries are cleared so retries can proceed.
 * PENDING_LOCK_LEASE_SEC bounds how long another request may hold the index lock; polling must run at least that long
 * so we do not return 503 while the lock is still legitimately held. */
const PENDING_LOCK_LEASE_SEC = 10;
/** Short poll: if index lock is not released quickly, fall through and create a Stripe customer (duplicate-by-email is acceptable). */
const POLL_MAX_ITERATIONS = 5;
const POLL_BASE_DELAY_MS = 200;
const POLL_MAX_ELAPSED_MS = 5000;
/** Firestore TTL on `expireAt` (730 days); refreshed when customer id is persisted. */
const STRIPE_CUSTOMER_INDEX_TTL_MS = 730 * 24 * 60 * 60 * 1000;

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

  const releaseLockOnError = async (err: unknown, opts?: { stripeCustomerId?: string }) => {
    const message = err instanceof Error ? err.message : String(err);
    await indexRef.update({
      pending: false,
      recoverableError: {
        message: message.slice(0, 500),
        at: Timestamp.now(),
        ...(opts?.stripeCustomerId ? { customerId: opts.stripeCustomerId } : {}),
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
      expireAt: Timestamp.fromMillis(Date.now() + STRIPE_CUSTOMER_INDEX_TTL_MS),
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
      if (result.action === "done") {
        const verified = await verifyIndexedStripeCustomerOrClear(
          stripe,
          indexRef,
          emailLower,
          result.customerId,
          "create-payment-intent"
        );
        if (verified) return verified;
        break;
      }
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
        break;
      }
    }

    if (!tookOver) {
      const snap = await indexRef.get();
      const data = snap.exists ? (snap.data() as { customerId?: string | null }) : null;
      if (data?.customerId) {
        const verified = await verifyIndexedStripeCustomerOrClear(
          stripe,
          indexRef,
          emailLower,
          data.customerId,
          "create-payment-intent"
        );
        if (verified) return verified;
      }
      // Fall through: create a new Stripe customer without waiting on the index lock.
    }
  }

  // After lock takeover, re-read in case the previous holder already created the customer.
  const reSnap = await indexRef.get();
  const reData = reSnap.exists ? (reSnap.data() as { customerId?: string | null }) : null;
  if (reData?.customerId) {
    const verified = await verifyIndexedStripeCustomerOrClear(
      stripe,
      indexRef,
      emailLower,
      reData.customerId,
      "create-payment-intent"
    );
    if (verified) return verified;
  }

  try {
    const existingList = await stripe.customers.list({ email: emailLower, limit: 1 });
    const existingId = existingList.data[0]?.id;
    if (existingId) {
      await indexRef
        .set(
          {
            customerId: existingId,
            pending: false,
            pendingLockExpiresAt: FieldValue.delete(),
            recoverableError: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
            expireAt: Timestamp.fromMillis(Date.now() + STRIPE_CUSTOMER_INDEX_TTL_MS),
          },
          { merge: true }
        )
        .catch((idxErr) => {
          bookingWarn("create-payment-intent", "stripe customer index update failed after customers.list match", {
            emailRedacted: redactEmail(emailLower),
            idxErr,
          });
        });
      return existingId;
    }
  } catch (listErr) {
    bookingWarn("create-payment-intent", "stripe.customers.list before create failed; will create new customer", {
      emailRedacted: redactEmail(emailLower),
      listErr,
    });
  }

  let customer: import("stripe").Stripe.Customer;
  try {
    const displayEmail = email.trim();
    customer = await stripe.customers.create({
      email: email.trim().toLowerCase(),
      name: name.trim() || undefined,
      phone: phone.trim() || undefined,
      metadata: { emailLower, displayEmail },
    });
  } catch (stripeErr) {
    await releaseLockOnError(stripeErr);
    throw stripeErr;
  }

  const FIRESTORE_CUSTOMER_INDEX_TX_MAX_ATTEMPTS = 5;
  let lastTxErr: unknown;
  for (let attempt = 0; attempt < FIRESTORE_CUSTOMER_INDEX_TX_MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 0) {
        const delayMs = Math.min(200 * Math.pow(2, attempt - 1), 2000);
        await new Promise((r) => setTimeout(r, delayMs));
      }
      const outcome = await db.runTransaction(async (tx) => {
        const snap = await tx.get(indexRef);
        const data = snap.exists
          ? (snap.data() as { customerId?: string | null })
          : null;
        const existing = typeof data?.customerId === "string" ? data.customerId.trim() : "";
        if (existing) {
          return { kind: "existing" as const, customerId: existing };
        }
        tx.set(
          indexRef,
          {
            customerId: customer.id,
            pending: false,
            pendingLockExpiresAt: FieldValue.delete(),
            recoverableError: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
            expireAt: Timestamp.fromMillis(Date.now() + STRIPE_CUSTOMER_INDEX_TTL_MS),
          },
          { merge: true }
        );
        return { kind: "new" as const, customerId: customer.id };
      });
      if (outcome.kind === "existing" && outcome.customerId !== customer.id) {
        const okExisting = await verifyIndexedStripeCustomerOrClear(
          stripe,
          indexRef,
          emailLower,
          outcome.customerId,
          "create-payment-intent"
        );
        if (okExisting) {
          try {
            await stripe.customers.del(customer.id);
          } catch (delErr) {
            bookingWarn("create-payment-intent", "failed to delete duplicate Stripe customer after index conflict", {
              emailRedacted: redactEmail(emailLower),
              duplicateStripeCustomerId: customer.id,
              delErr,
            });
          }
          return okExisting;
        }
        continue;
      }
      return customer.id;
    } catch (txErr) {
      lastTxErr = txErr;
      bookingWarn("create-payment-intent", "stripe customer index transaction failed after customers.create (will retry)", {
        emailRedacted: redactEmail(emailLower),
        attempt: attempt + 1,
        maxAttempts: FIRESTORE_CUSTOMER_INDEX_TX_MAX_ATTEMPTS,
        err: txErr,
      });
    }
  }
  bookingError(
    "create-payment-intent",
    "stripe customer created but Firestore index conditional write failed after retries — operator may link customer manually",
    lastTxErr,
    { emailRedacted: redactEmail(emailLower), stripeCustomerId: customer.id }
  );
  await releaseLockOnError(lastTxErr ?? new Error("Firestore transaction failed"), { stripeCustomerId: customer.id });
  throw lastTxErr instanceof Error ? lastTxErr : new Error(String(lastTxErr));
}

export async function POST(request: NextRequest) {
  try {
    bookingLog("create-payment-intent", "request started");
    const rl = await checkRateLimitSensitiveMutation(getClientKey(request));
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
    const notReady = bookingNotReadyResponse();
    if (notReady) return notReady;
    const legacyUnsafe = legacyFallbackUnsafeResponse();
    if (legacyUnsafe) return legacyUnsafe;
    try {
      assertReceiptTokenSecretConfigured();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      bookingError("create-payment-intent", "RECEIPT_TOKEN_SECRET missing in non-development — refusing payment intent", null, {
        nodeEnv: process.env.NODE_ENV ?? "",
        message: msg,
      });
      return NextResponse.json(
        {
          error:
            "Booking payments are temporarily unavailable (server configuration: RECEIPT_TOKEN_SECRET). Set the secret and redeploy.",
        },
        { status: 503 }
      );
    }
    const body = await request.json();
    const input = parseBody(body);
    if (!input) {
      bookingLog("create-payment-intent", "invalid body: holdId required");
      return NextResponse.json({ error: "holdId required" }, { status: 400 });
    }
    bookingLog("create-payment-intent", "parsed input", {
      holdId: input.holdId,
      clientPayFullAmount: input.clientPayFullAmount,
    });
    if (!hasReleaseTokenSecret()) {
      bookingError("create-payment-intent", "RELEASE_TOKEN_SECRET is not set; refusing payment intent creation in production", null, {
        holdId: input.holdId,
        nodeEnv: process.env.NODE_ENV ?? "",
      });
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
          {
            error:
              "Booking payments are temporarily unavailable (server configuration: RELEASE_TOKEN_SECRET). Set the secret and redeploy.",
          },
          { status: 503 }
        );
      }
    }
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
        const lax = verifyReleaseTokenIgnoreExpiry(input.release_token);
        if (!lax || lax.holdId !== input.holdId) {
          return NextResponse.json({ error: "Invalid or expired release link" }, { status: 401 });
        }
        const holdExp = (hold.expiresAt as { toDate(): Date }).toDate();
        if (holdExp < new Date()) {
          return NextResponse.json({ error: "Invalid or expired release link" }, { status: 401 });
        }
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
    let totalCents = 0;
    let depositCents = 0;
    let finalCents = 0;
    let experienceForPolicy: Experience | null = null;
    if (hold.experienceId) {
      try {
        const expSnap = await db.collection("experiences").doc(hold.experienceId).get();
        experienceForPolicy = expSnap.exists ? (expSnap.data() as Experience) : null;
        if (!experienceForPolicy) {
          const incidentCode = generateIncidentCode();
          bookingError(
            "create-payment-intent",
            "experience document missing for hold — cannot determine deposit vs full charge",
            null,
            { holdId: input.holdId, experienceId: hold.experienceId, incidentCode }
          );
          await writeOperationalAlert({
            type: "create_payment_intent_experience_not_found",
            holdId: input.holdId,
            experienceId: hold.experienceId,
            source: "create-payment-intent",
            incidentCode,
          });
          return NextResponse.json(
            { error: "Booking configuration error. Please try again shortly.", incidentCode },
            { status: 503 }
          );
        }
      } catch (fetchErr) {
        const incidentCode = generateIncidentCode();
        bookingError(
          "create-payment-intent",
          "experience fetch failed — cannot determine deposit vs full charge",
          fetchErr,
          { holdId: input.holdId, experienceId: hold.experienceId, incidentCode }
        );
        await writeOperationalAlert({
          type: "create_payment_intent_experience_fetch_failed",
          holdId: input.holdId,
          experienceId: hold.experienceId,
          source: "create-payment-intent",
          incidentCode,
        });
        return NextResponse.json(
          { error: "Booking configuration error. Please try again shortly.", incidentCode },
          { status: 503 }
        );
      }
    }
    // Shared ticketed experiences always charge full — no deposit option.
    let payFullAmount: boolean;
    if (shouldForceFullPaymentAtCheckout()) {
      payFullAmount = true;
    } else if ((hold as { bookingMode?: string }).bookingMode === "shared") {
      payFullAmount = true;
    } else if (hold.experienceId && experienceForPolicy) {
      // Charter: allowDeposit gates whether deposit is offered; when true, honor client payFullAmount (default deposit).
      const holdAllowDeposit =
        typeof (hold as { allowDeposit?: boolean }).allowDeposit === "boolean"
          ? (hold as { allowDeposit?: boolean }).allowDeposit
          : experienceForPolicy.allowDeposit === true;
      if (holdAllowDeposit === true) {
        if (!input.clientPayFullAmount) {
          const parsedHoldSlot = parseSlotIdRelaxed(hold.slotId) ?? parseSlotId(hold.slotId);
          if (!parsedHoldSlot) {
            return NextResponse.json({ error: "Invalid hold slot. Please create a new hold and try again." }, { status: 400 });
          }
          const slotStart = getSlotStartEnd(
            parsedHoldSlot.dateStr,
            parsedHoldSlot.startHour,
            parsedHoldSlot.durationHours,
            parsedHoldSlot.startMinute ?? 0
          ).start;
          if (!isDepositEligibleByLeadTime(slotStart.getTime(), Date.now())) {
            return NextResponse.json(
              { error: `Deposit is only available for trips more than ${getDepositLeadTimeHours()} hours away. Please pay in full.` },
              { status: 400 }
            );
          }
        }
        payFullAmount = input.clientPayFullAmount;
      } else {
        payFullAmount = true;
        bookingWarn("create-payment-intent", "deposit coerced to full: allowDeposit disabled or not set", {
          holdId: input.holdId,
          experienceId: hold.experienceId,
        });
      }
    } else {
      // Legacy boat holds have no experience allowDeposit — deposits are not allowed.
      payFullAmount = true;
      bookingWarn("create-payment-intent", "deposit coerced to full: legacy hold without experience allowDeposit", { holdId: input.holdId });
    }
    bookingLog("create-payment-intent", "pricing", {
      holdId: input.holdId,
      payFullAmount,
    });

    const { Timestamp, FieldValue } = getFirestoreExports();
    type MergeTxResult =
      | { ok: false; code: "not_found" | "inactive" | "expired" | "pi_field_conflict"; existingPiId?: string }
      | {
          ok: true;
          effectiveExpiresAt: Date;
          holdExtendedForPayment: boolean;
          otherIdToCancel?: string;
          /** PI id for this payment stage read inside the transaction (authoritative vs non-transactional get). */
          existingPiIdForStage?: string;
          holdPaymentAttemptVersion: number;
          holdSnapshot: Hold;
          pricingFingerprint: string;
        };

    /** Extends hold expiry when first entering payment; optionally persists paymentIntent id in the same write (atomic with expiry). */
    const runHoldExtensionTransaction = async (
      paymentIntentIdToPersist: string | null,
      options?: { noExtend?: boolean; expectedPricingFingerprint?: string }
    ): Promise<MergeTxResult> => {
      const noExtend = options?.noExtend === true;
      const expectedPricingFingerprint = options?.expectedPricingFingerprint;
      return await db.runTransaction(async (tx): Promise<MergeTxResult> => {
        const snap = await tx.get(holdRef);
        if (!snap.exists) return { ok: false, code: "not_found" };
        const h = snap.data() as Hold & {
          paymentIntentExpiryExtendedAt?: { toDate(): Date };
          depositPaymentIntentId?: string;
          fullPaymentIntentId?: string;
          paymentAttemptVersion?: number;
        };
        if (h.status !== "active") return { ok: false, code: "inactive" };
        const exp = (h.expiresAt as { toDate(): Date }).toDate();
        const now = new Date();
        if (exp < now) return { ok: false, code: "expired" };

        const otherField = payFullAmount ? "depositPaymentIntentId" : "fullPaymentIntentId";
        const piField = payFullAmount ? "fullPaymentIntentId" : "depositPaymentIntentId";
        const otherIdRaw = (payFullAmount ? h.depositPaymentIntentId : h.fullPaymentIntentId)?.trim();
        const existingPiIdForStage = (h[piField as "fullPaymentIntentId"] as string | undefined)?.trim() || undefined;
        const holdPaymentAttemptVersion = typeof h.paymentAttemptVersion === "number" ? h.paymentAttemptVersion : 1;
        const pricingFingerprint = JSON.stringify({
          total: h.pricing?.totalCents ?? null,
          subtotal: h.pricing?.subtotalCents ?? null,
          tip: (h as { tipCents?: number }).tipCents ?? 0,
          discount: (h as { discountCents?: number }).discountCents ?? 0,
          currency: h.pricing?.currency ?? null,
        });
        if (expectedPricingFingerprint && expectedPricingFingerprint !== pricingFingerprint) {
          return { ok: false, code: "pi_field_conflict", existingPiId: undefined };
        }

        if (noExtend && !paymentIntentIdToPersist) {
          return {
            ok: true,
            effectiveExpiresAt: exp,
            holdExtendedForPayment: false,
            otherIdToCancel: undefined,
            existingPiIdForStage,
            holdPaymentAttemptVersion,
            holdSnapshot: h,
            pricingFingerprint,
          };
        }

        const alreadyExtended = h.paymentIntentExpiryExtendedAt != null;
        let effectiveExpiresAt = exp;
        let holdExtendedForPayment = false;
        const updates: Record<string, unknown> = {};

        if (!alreadyExtended) {
          const createdRaw = h.createdAt as { toDate(): Date } | undefined;
          const createdMs = createdRaw && typeof createdRaw.toDate === "function" ? createdRaw.toDate().getTime() : now.getTime();
          const maxEnd = new Date(createdMs + MAX_HOLD_LIFETIME_FROM_CREATED_MS);
          let next = new Date(now.getTime() + HOLD_CHECKOUT_SESSION_EXTENSION_MINUTES * 60 * 1000);
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
        if (paymentIntentIdToPersist) {
          const currentPi = (h[piField as "fullPaymentIntentId"] as string | undefined)?.trim();
          if (currentPi && currentPi !== paymentIntentIdToPersist) {
            return { ok: false, code: "pi_field_conflict", existingPiId: currentPi };
          }
          updates[piField] = paymentIntentIdToPersist;
        }
        if (Object.keys(updates).length > 0) {
          tx.update(holdRef, updates);
        }
        return {
          ok: true,
          effectiveExpiresAt,
          holdExtendedForPayment,
          otherIdToCancel: otherIdRaw,
          existingPiIdForStage,
          holdPaymentAttemptVersion,
          holdSnapshot: h,
          pricingFingerprint,
        };
      });
    };

    const cancelOppositeStripeIntent = async (otherId: string | undefined) => {
      if (!otherId) return;
      const stripe = getStripe();
      try {
        const otherPi = await stripe.paymentIntents.retrieve(otherId);
        if (otherPi.status !== "succeeded" && otherPi.status !== "canceled") {
          try {
            await stripe.paymentIntents.cancel(otherId);
          } catch (cancelErr) {
            await writeOperationalAlert({
              type: "cancel_opposite_stripe_intent_failed",
              source: "create-payment-intent",
              holdId: input.holdId,
              otherPaymentIntentId: otherId,
              lastError: cancelErr instanceof Error ? cancelErr.message : String(cancelErr),
            });
          }
        }
        bookingLog("create-payment-intent", "canceled opposite preconversion PI (field cleared in hold transaction)", {
          holdId: input.holdId,
          payFullAmount,
        });
      } catch (oppErr) {
        await writeOperationalAlert({
          type: "cancel_opposite_stripe_intent_retrieve_failed",
          source: "create-payment-intent",
          holdId: input.holdId,
          otherPaymentIntentId: otherId,
          lastError: oppErr instanceof Error ? oppErr.message : String(oppErr),
        });
        bookingWarn("create-payment-intent", "failed to cancel opposite preconversion PI (continuing)", {
          holdId: input.holdId,
          err: oppErr,
        });
      }
    };

    const receiptClaimToken = signReceiptClaimToken(input.holdId);

    // Transactional probe captures authoritative hold snapshot before any Stripe side effects.
    const probeBeforeCustomer = await runHoldExtensionTransaction(null, { noExtend: true });
    if (!probeBeforeCustomer.ok) {
      if (probeBeforeCustomer.code === "not_found") {
        return NextResponse.json({ error: "Hold not found" }, { status: 404 });
      }
      bookingLog("create-payment-intent", "hold no longer valid (probe before Stripe customer)", {
        holdId: input.holdId,
        code: probeBeforeCustomer.code,
      });
      return NextResponse.json(
        { error: probeBeforeCustomer.code === "expired" ? "Hold expired" : "Hold expired or already used" },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const customerDraft = probeBeforeCustomer.holdSnapshot.customerDraft ?? hold.customerDraft;
    const customerId = await getOrCreateStripeCustomer(
      db,
      stripe,
      customerDraft.email,
      customerDraft.name,
      customerDraft.phone
    );

    for (let spin = 0; spin < 5; spin++) {
      const probe = await runHoldExtensionTransaction(null, { noExtend: true });
      if (!probe.ok) {
        if (probe.code === "not_found") {
          return NextResponse.json({ error: "Hold not found" }, { status: 404 });
        }
        bookingLog("create-payment-intent", "hold no longer valid (probe)", {
          holdId: input.holdId,
          code: probe.code,
        });
        return NextResponse.json(
          { error: probe.code === "expired" ? "Hold expired" : "Hold expired or already used" },
          { status: 400 }
        );
      }
      const existingPiId = probe.existingPiIdForStage;
      let holdPaymentAttemptVersion = probe.holdPaymentAttemptVersion;
      const holdForCharge = probe.holdSnapshot;
      let pricing: import("@/lib/booking/types").BookingPricing;
      try {
        const resolved = await resolveHoldBookingPricing(db, holdForCharge, { mode: "payment_intent" });
        pricing = resolved.pricing;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "RATE_NOT_FOUND") return NextResponse.json({ error: "Rate not found" }, { status: 404 });
        if (msg === "BOAT_NOT_FOUND") return NextResponse.json({ error: "Boat not found" }, { status: 404 });
        if (msg === "HOLD_PRICING_REQUIRED_FOR_PAYMENT_INTENT") {
          return NextResponse.json({ error: "Hold pricing snapshot missing. Please create a new hold." }, { status: 409 });
        }
        throw e;
      }
      const tipCents = (holdForCharge as { tipCents?: number }).tipCents ?? 0;
      const discountCents = (holdForCharge as { discountCents?: number }).discountCents ?? 0;
      totalCents = computeFinalChargeTotalCentsFromHoldPricing(pricing, tipCents, discountCents);
      depositCents = Math.round(totalCents * DEPOSIT_FRACTION);
      finalCents = totalCents - depositCents;
      const chargeCents = payFullAmount ? totalCents : depositCents;

      // Reuse an existing active PaymentIntent for this hold+stage to prevent duplicate charges.
      // PI id is read inside `probe` (transactional) — not a separate get() before Stripe calls.
      if (existingPiId) {
        try {
          bookingLog("create-payment-intent", "checking existing PI", {
            holdId: input.holdId,
            existingPaymentIntentId: existingPiId,
            payFullAmount,
          });
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
              if (
                existing.status === "requires_payment_method" ||
                existing.status === "requires_confirmation" ||
                existing.status === "requires_action"
              ) {
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
                if (
                  existing.status === "requires_payment_method" ||
                  existing.status === "requires_confirmation" ||
                  existing.status === "requires_action"
                ) {
                  await stripe.paymentIntents.cancel(existingPiId).catch(() => {});
                }
                const { FieldValue } = getFirestoreExports();
                await holdRef.update(
                  payFullAmount ? { fullPaymentIntentId: FieldValue.delete() } : { depositPaymentIntentId: FieldValue.delete() }
                );
              } else {
                if (existing.status === "requires_action") {
                  bookingLog("create-payment-intent", "existing PI requires_action after stage/version match — cancel and clear", {
                    holdId: input.holdId,
                  });
                  await stripe.paymentIntents.cancel(existingPiId).catch(() => {});
                  const { FieldValue } = getFirestoreExports();
                  await holdRef.update(
                    payFullAmount ? { fullPaymentIntentId: FieldValue.delete() } : { depositPaymentIntentId: FieldValue.delete() }
                  );
                  continue;
                }
                const existingAmount = existing.amount;
                if (existingAmount === chargeCents && existing.client_secret) {
                  if (!payFullAmount) {
                    const parsedReuseSlot =
                      parseSlotIdRelaxed(holdForCharge.slotId) ?? parseSlotId(holdForCharge.slotId);
                    if (!parsedReuseSlot) {
                      return NextResponse.json(
                        { error: "Invalid hold slot. Please create a new hold and try again." },
                        { status: 400 }
                      );
                    }
                    const slotStartReuse = getSlotStartEnd(
                      parsedReuseSlot.dateStr,
                      parsedReuseSlot.startHour,
                      parsedReuseSlot.durationHours,
                      parsedReuseSlot.startMinute ?? 0
                    ).start;
                    if (!isDepositEligibleByLeadTime(slotStartReuse.getTime(), Date.now())) {
                      await stripe.paymentIntents.cancel(existingPiId).catch(() => {});
                      const { FieldValue: fvDepositWindowClosed } = getFirestoreExports();
                      await holdRef.update({
                        depositPaymentIntentId: fvDepositWindowClosed.delete(),
                        updatedAt: fvDepositWindowClosed.serverTimestamp(),
                      });
                      return NextResponse.json(
                        {
                          error:
                            "The deposit payment window has closed for this trip. Please pay in full to complete your booking.",
                        },
                        { status: 400 }
                      );
                    }
                  }
                  bookingLog("create-payment-intent", "reusing existing PI", {
                    holdId: input.holdId,
                    paymentIntentId: existing.id,
                  });
                  const mergeReuse = await runHoldExtensionTransaction(null);
                  if (!mergeReuse.ok) {
                    if (mergeReuse.code === "not_found") {
                      return NextResponse.json({ error: "Hold not found" }, { status: 404 });
                    }
                    bookingLog("create-payment-intent", "hold no longer valid in extension transaction", {
                      holdId: input.holdId,
                      code: mergeReuse.code,
                    });
                    return NextResponse.json(
                      { error: mergeReuse.code === "expired" ? "Hold expired" : "Hold expired or already used" },
                      { status: 400 }
                    );
                  }
                  if (mergeReuse.otherIdToCancel) {
                    const { FieldValue } = getFirestoreExports();
                    await holdRef.update({
                      pendingCancelPaymentIntentIds: FieldValue.arrayUnion(mergeReuse.otherIdToCancel),
                      updatedAt: FieldValue.serverTimestamp(),
                    });
                  }
                  await cancelOppositeStripeIntent(mergeReuse.otherIdToCancel);
                  if (mergeReuse.holdExtendedForPayment) {
                    bookingLog("create-payment-intent", "hold expiry extended (first PI extension)", {
                      holdId: input.holdId,
                      newExpiresAt: mergeReuse.effectiveExpiresAt.toISOString(),
                    });
                  } else {
                    bookingLog("create-payment-intent", "hold expiry not extended (PI retry; already extended once)", {
                      holdId: input.holdId,
                      effectiveExpiresAt: mergeReuse.effectiveExpiresAt.toISOString(),
                    });
                  }
                  const rtFieldReuse = releaseTokenFieldForResponse(input.holdId, mergeReuse.effectiveExpiresAt);
                  const resReuse = NextResponse.json({
                    clientSecret: existing.client_secret,
                    paymentIntentId: existing.id,
                    depositCents: payFullAmount ? totalCents : depositCents,
                    finalCents: payFullAmount ? 0 : finalCents,
                    totalCents,
                    payFullAmount,
                    expiresAt: mergeReuse.effectiveExpiresAt.toISOString(),
                    holdExtendedForPayment: mergeReuse.holdExtendedForPayment,
                    ...(!mergeReuse.holdExtendedForPayment
                      ? {
                          holdExpiryNote:
                            "Your hold time was not extended again. Complete payment before it expires, or start over to pick a new time.",
                        }
                      : {}),
                    ...(typeof hold.effectiveRateCents === "number" ? { effectiveRateCents: hold.effectiveRateCents } : {}),
                    ...(receiptClaimToken ? { receiptClaimToken } : {}),
                    ...rtFieldReuse,
                  });
                  if ("releaseToken" in rtFieldReuse && rtFieldReuse.releaseToken) {
                    attachHoldReleaseCookie(resReuse, rtFieldReuse.releaseToken, mergeReuse.effectiveExpiresAt.toISOString());
                  }
                  return resReuse;
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
          bookingWarn("create-payment-intent", "failed to retrieve existing PI, creating new one", {
            holdId: input.holdId,
            existingPaymentIntentId: existingPiId,
            err: piErr,
          });
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
      if (metadata.payment_stage !== "full" && metadata.payment_stage !== "deposit") {
        const incidentCode = generateIncidentCode();
        await writeOperationalAlert({
          type: "payment_intent_missing_payment_stage",
          source: "create-payment-intent",
          holdId: input.holdId,
          incidentCode,
        });
        bookingError(
          "create-payment-intent",
          "PaymentIntent metadata invariant failed: payment_stage must be full or deposit before create",
          null,
          { holdId: input.holdId, incidentCode }
        );
        return NextResponse.json(
          {
            error: "Payment could not be started due to an internal metadata error. Please try again or contact support.",
            incidentCode,
          },
          { status: 500 }
        );
      }

      const idempotencyKey = buildPaymentIntentIdempotencyKey({
        holdId: input.holdId,
        payFullAmount,
        chargeCents,
        holdPaymentAttemptVersion,
      });
      bookingLog("create-payment-intent", "creating new PaymentIntent", {
        holdId: input.holdId,
        payFullAmount,
      });
      const paymentIntentParams: Parameters<typeof stripe.paymentIntents.create>[0] = {
        amount: chargeCents,
        currency: "usd",
        customer: customerId,
        metadata,
        ...buildBookingPaymentIntentMethodParams({ payFullAmount, experience: experienceForPolicy }),
      };
      const stage = paymentIntentParams.metadata?.payment_stage;
      if (stage !== "full" && stage !== "deposit") {
        const incidentCode = generateIncidentCode();
        await writeOperationalAlert({
          type: "payment_intent_missing_payment_stage",
          source: "create-payment-intent",
          holdId: input.holdId,
          incidentCode,
          stage: stage ?? null,
        });
        bookingError(
          "create-payment-intent",
          "Refusing stripe.paymentIntents.create: metadata.payment_stage must be full or deposit",
          null,
          { holdId: input.holdId, incidentCode }
        );
        return NextResponse.json(
          {
            error: "Payment could not be started due to an internal metadata error. Please try again or contact support.",
            incidentCode,
          },
          { status: 500 }
        );
      }
      const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams, { idempotencyKey });
      if (!paymentIntent.client_secret) {
        bookingError("create-payment-intent", "PaymentIntent missing client secret", null, {
          paymentIntentId: paymentIntent.id,
        });
        return NextResponse.json({ error: "PaymentIntent missing client secret" }, { status: 500 });
      }
      const mergeNew = await runHoldExtensionTransaction(paymentIntent.id, {
        expectedPricingFingerprint: probe.pricingFingerprint,
      });
      if (!mergeNew.ok) {
        await stripe.paymentIntents.cancel(paymentIntent.id).catch(() => {});
        if (mergeNew.code === "pi_field_conflict") {
          bookingLog("create-payment-intent", "PI field race: another request persisted first; retrying", {
            holdId: input.holdId,
          });
          continue;
        }
        if (mergeNew.code === "not_found") {
          return NextResponse.json({ error: "Hold not found" }, { status: 404 });
        }
        bookingLog("create-payment-intent", "hold no longer valid after PaymentIntent create", {
          holdId: input.holdId,
          code: mergeNew.code,
        });
        return NextResponse.json(
          { error: mergeNew.code === "expired" ? "Hold expired" : "Hold expired or already used" },
          { status: 400 }
        );
      }
      if (mergeNew.otherIdToCancel) {
        await holdRef.update({
          pendingCancelPaymentIntentIds: FieldValue.arrayUnion(mergeNew.otherIdToCancel),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      await cancelOppositeStripeIntent(mergeNew.otherIdToCancel);
      if (mergeNew.holdExtendedForPayment) {
        bookingLog("create-payment-intent", "hold expiry extended (first PI extension)", {
          holdId: input.holdId,
          newExpiresAt: mergeNew.effectiveExpiresAt.toISOString(),
        });
      } else {
        bookingLog("create-payment-intent", "hold expiry not extended (PI retry; already extended once)", {
          holdId: input.holdId,
          effectiveExpiresAt: mergeNew.effectiveExpiresAt.toISOString(),
        });
      }
      bookingLog("create-payment-intent", "PaymentIntent created and persisted", {
        holdId: input.holdId,
        paymentIntentId: paymentIntent.id,
        payFullAmount,
      });
      const rtFieldNew = releaseTokenFieldForResponse(input.holdId, mergeNew.effectiveExpiresAt);
      const resNew = NextResponse.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        depositCents: payFullAmount ? totalCents : depositCents,
        finalCents: payFullAmount ? 0 : finalCents,
        totalCents,
        payFullAmount,
        expiresAt: mergeNew.effectiveExpiresAt.toISOString(),
        holdExtendedForPayment: mergeNew.holdExtendedForPayment,
        ...(!mergeNew.holdExtendedForPayment
          ? {
              holdExpiryNote:
                "Your hold time was not extended again. Complete payment before it expires, or start over to pick a new time.",
            }
          : {}),
        ...(typeof hold.effectiveRateCents === "number" ? { effectiveRateCents: hold.effectiveRateCents } : {}),
        ...(receiptClaimToken ? { receiptClaimToken } : {}),
        ...rtFieldNew,
      });
      if ("releaseToken" in rtFieldNew && rtFieldNew.releaseToken) {
        attachHoldReleaseCookie(resNew, rtFieldNew.releaseToken, mergeNew.effectiveExpiresAt.toISOString());
      }
      return resNew;
    }
    return NextResponse.json(
      { error: "Payment is temporarily unavailable. Please try again in a moment.", incidentCode: generateIncidentCode() },
      { status: 503 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create payment intent failed";
    const isConfig = /Firebase config missing|FIREBASE_PRIVATE_KEY|Missing required env|STRIPE_SECRET_KEY/i.test(message);
    const isRetriable = err instanceof Error && (err as { retriable?: boolean }).retriable === true;
    const incidentCode = generateIncidentCode();
    const stripeMeta =
      err != null && typeof err === "object" && "type" in err && typeof (err as { type?: unknown }).type === "string"
        ? (() => {
            const stripeErr = err as { type: string; code?: unknown };
            const stripeCode =
              typeof stripeErr.code === "string" ? stripeErr.code : undefined;
            return {
              stripeType: stripeErr.type,
              ...(stripeCode !== undefined ? { stripeCode } : {}),
            };
          })()
        : {};
    bookingError("create-payment-intent", "create payment intent failed", err, {
      message,
      incidentCode,
      hint: isConfig ? "Set Firebase and Stripe env vars in deployment (see docs/BOOKING_SETUP.md)." : undefined,
      ...stripeMeta,
    });
    if (isRetriable) {
      return NextResponse.json(
        { error: "Payment is temporarily unavailable. Please try again in a moment.", incidentCode },
        { status: 503 }
      );
    }
    const isDev = process.env.NODE_ENV === "development";
    return NextResponse.json(
      {
        error: isConfig
          ? "Service temporarily unavailable. Please try again shortly."
          : isDev
            ? message
            : "Payment is temporarily unavailable. Please try again.",
        incidentCode,
        ...(isDev && !isConfig ? { ...stripeMeta } : {}),
      },
      { status: isConfig ? 503 : 500 }
    );
  }
}
