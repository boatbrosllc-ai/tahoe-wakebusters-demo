/**
 * Shared helpers for checkout session creation and rollback.
 * Used by create-checkout-session and create-checkout-session-direct to avoid duplicating rollback logic.
 */

import type { Firestore, DocumentReference } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { getDepartureInventoryRef, getReservedSeats } from "@/lib/booking/shared-departure-inventory";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import { bookingError } from "@/lib/booking/debug";
import { validateAndApplyDiscount } from "@/lib/booking/discount";
import type { Discount } from "@/lib/booking/types";

/** Thrown inside Firestore transactions when discount validation fails (no retry). */
export class CheckoutDiscountPersistError extends Error {
  constructor(
    message: string,
    public readonly clientMessage: string
  ) {
    super(message);
    this.name = "CheckoutDiscountPersistError";
  }
}

/** Atomically reserve discount usage with checkoutSessionId on the hold (direct checkout pattern). */
export type DiscountAtomicPersistOnCheckoutSession = {
  discountRef: DocumentReference;
  /** Subtotal before discount — same base as `validateAndApplyDiscount` / create-hold. */
  pricingTotalCents: number;
  expectedDiscountCents: number;
  expectedCode: string;
};

export type HoldLike = {
  slotId: string;
  boatId?: string | null;
  experienceId?: string | null;
  partySize?: number | null;
  bookingMode?: string;
  /** When set, rollback restores this discount's usedCount in the same transaction (hold had reserved it). */
  discountCode?: string | null;
  /** When set, use direct doc read instead of query for discount usedCount decrement (legacy holds use discountCode query). */
  discountDocId?: string | null;
};

/** Matches getFirestoreExports() from firebase-admin: the FieldValue namespace with delete(), serverTimestamp(), etc. */
export type FirestoreExports = {
  FieldValue: typeof import("firebase-admin").firestore.FieldValue;
  Timestamp?: typeof import("firebase-admin").firestore.Timestamp;
};

/**
 * Rollback a checkout session failure: release the slot (and shared-departure capacity when applicable),
 * mark the hold as expired so the slot/capacity is available again, and restore discount usage when
 * the hold had a reserved discount. Only when the hold actually transitions from active to expired.
 * Best-effort; log errors but do not throw so the caller can surface the original failure.
 */
export type RollbackCheckoutSessionResult = { ok: true } | { ok: false; error: unknown };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function rollbackCheckoutSession(
  db: Firestore,
  holdId: string,
  hold: HoldLike,
  firestoreExports: FirestoreExports
): Promise<RollbackCheckoutSessionResult> {
  const { FieldValue } = firestoreExports;
  const slotRef = hold.boatId
    ? db.collection("boats").doc(hold.boatId).collection("slots").doc(hold.slotId)
    : hold.experienceId
      ? db.collection("experiences").doc(hold.experienceId).collection("slots").doc(hold.slotId)
      : null;
  const bookingMode = hold.bookingMode;
  const isSharedTicketed = bookingMode === "shared" && !!hold.experienceId;
  const parsedSlot = hold.slotId ? parseSlotId(hold.slotId) : null;
  const inventoryRef =
    isSharedTicketed && parsedSlot && hold.experienceId
      ? getDepartureInventoryRef(db, hold.experienceId, parsedSlot.dateStr)
      : null;
  const holdRef = db.collection("holds").doc(holdId);

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db.runTransaction(async (tx) => {
        const holdSnap = await tx.get(holdRef);
        if (!holdSnap.exists) return;
        const holdData = holdSnap.data() as { status?: string; discountCode?: string; discountDocId?: string };
        if (holdData.status !== "active") return;

        const slotSnap = slotRef ? await tx.get(slotRef) : { exists: false, data: () => null };
        const reservedAfterRelease =
          inventoryRef != null && typeof hold.partySize === "number"
            ? Math.max(0, (await getReservedSeats(tx, inventoryRef)) - hold.partySize)
            : null;

        const discountDocId = holdData.discountDocId ?? (hold as { discountDocId?: string }).discountDocId;
        const discountCode = holdData.discountCode ?? hold.discountCode;
        let discountRollback: { ref: DocumentReference; nextCount: number } | null = null;
        if (discountDocId) {
          const discountRef = db.collection("discounts").doc(discountDocId);
          const discountSnap = await tx.get(discountRef);
          if (discountSnap.exists) {
            const d = discountSnap.data() as { usedCount?: number };
            discountRollback = {
              ref: discountRef,
              nextCount: Math.max(0, (d.usedCount ?? 0) - 1),
            };
          }
        } else if (discountCode && discountCode.trim()) {
          const discountSnap = await tx.get(
            db.collection("discounts").where("code", "==", discountCode.trim()).limit(1)
          );
          if (!discountSnap.empty) {
            const d = discountSnap.docs[0].data() as { usedCount?: number };
            discountRollback = {
              ref: discountSnap.docs[0].ref,
              nextCount: Math.max(0, (d.usedCount ?? 0) - 1),
            };
          }
        }

        if (slotRef && slotSnap.exists && (slotSnap.data() as { holdId?: string })?.holdId === holdId) {
          tx.update(slotRef, {
            status: "open",
            holdId: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        if (inventoryRef != null && reservedAfterRelease !== null) {
          tx.set(
            inventoryRef,
            { reservedSeats: reservedAfterRelease, updatedAt: FieldValue.serverTimestamp() },
            { merge: true }
          );
        }
        tx.update(holdRef, {
          status: "expired",
          sessionCreationInFlight: FieldValue.delete(),
          rollbackPending: FieldValue.delete(),
          rollbackPendingExpiresAt: FieldValue.delete(),
        });

        if (discountRollback) {
          tx.update(discountRollback.ref, {
            usedCount: discountRollback.nextCount,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });
      return { ok: true };
    } catch (rollbackErr) {
      lastErr = rollbackErr;
      if (attempt < 2) await sleep(100 * 2 ** attempt);
    }
  }
  console.error("[rollbackCheckoutSession] rollback failed after retries", { holdId, err: lastErr });
  await writeOperationalAlert({
    type: "rollback_checkout_capacity_unrecovered",
    source: "rollbackCheckoutSession",
    holdId,
    message: "Rollback failed after 3 retries; slot/capacity may remain reserved until reconciliation.",
    lastError: lastErr instanceof Error ? lastErr.message : String(lastErr),
  }).catch(() => {});
  try {
    await holdRef.update({
      rollbackPending: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (markErr) {
    console.error("[rollbackCheckoutSession] failed to set rollbackPending", { holdId, err: markErr });
  }
  return { ok: false, error: lastErr };
}

/** Concurrent create-checkout-session calls: ignore stale in-flight markers after this window. */
export const SESSION_CREATION_IN_FLIGHT_MAX_AGE_MS = 30_000;

export type CheckoutSessionMode = "embedded" | "redirect";

export type AcquireCheckoutSessionLockResult =
  | { kind: "proceed"; holdSnap: import("firebase-admin/firestore").DocumentSnapshot }
  | { kind: "use_existing"; checkoutSessionId: string; holdSnap: import("firebase-admin/firestore").DocumentSnapshot }
  | { kind: "conflict" }
  | { kind: "hold_inactive" };

function isRecentInflight(
  sessionCreationInFlight: unknown,
  nowMs: number,
  Timestamp: typeof import("firebase-admin").firestore.Timestamp
): boolean {
  if (sessionCreationInFlight == null) return false;
  const ts = sessionCreationInFlight as { toMillis?: () => number };
  if (typeof ts.toMillis !== "function") return false;
  return nowMs - ts.toMillis() < SESSION_CREATION_IN_FLIGHT_MAX_AGE_MS;
}

/**
 * Before stripe.checkout.sessions.create: serialize session creation per hold and detect concurrent callers.
 */
export async function acquireCheckoutSessionCreationLock(
  db: Firestore,
  holdRef: DocumentReference,
  Timestamp: typeof import("firebase-admin").firestore.Timestamp,
  desiredMode: CheckoutSessionMode
): Promise<AcquireCheckoutSessionLockResult> {
  const nowMs = Date.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(holdRef);
    if (!snap.exists) return { kind: "hold_inactive" };
    const h = snap.data() as {
      status?: string;
      expiresAt?: { toDate(): Date };
      sessionCreationInFlight?: unknown;
      checkoutSessionId?: string;
      checkoutSessionMode?: CheckoutSessionMode;
    };
    if (h.status !== "active") return { kind: "hold_inactive" };
    const exp = h.expiresAt?.toDate?.();
    if (exp && exp < new Date()) return { kind: "hold_inactive" };
    const inflightRecent = isRecentInflight(h.sessionCreationInFlight, nowMs, Timestamp);
    const existingCs = typeof h.checkoutSessionId === "string" ? h.checkoutSessionId.trim() : "";
    const storedMode = h.checkoutSessionMode;
    const modeMatches = storedMode == null || storedMode === desiredMode;
    if (inflightRecent) {
      if (existingCs && modeMatches) return { kind: "use_existing", checkoutSessionId: existingCs, holdSnap: snap };
      if (existingCs && !modeMatches) return { kind: "proceed", holdSnap: snap };
      return { kind: "conflict" };
    }
    tx.update(holdRef, { sessionCreationInFlight: Timestamp.now() });
    return { kind: "proceed", holdSnap: snap };
  });
}

export async function clearSessionCreationInflight(
  holdRef: DocumentReference,
  FieldValue: FirestoreExports["FieldValue"]
): Promise<void> {
  try {
    await holdRef.update({ sessionCreationInFlight: FieldValue.delete() });
  } catch (e) {
    console.error("[clearSessionCreationInflight] failed", e);
  }
}

export type PersistCheckoutSessionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "lost_race" | "hold_inactive" | "persist_exhausted" | "discount_invalid";
      /** Set when reason is discount_invalid — safe to surface to the client. */
      discountMessage?: string;
    };

/**
 * After Stripe session.create succeeds: atomically clear in-flight sentinel and persist checkout fields.
 * Retries transient Firestore errors. On lost race, expires the orphaned Stripe session.
 * On total persist failure, escalates via writeOperationalAlert (session still open on Stripe for manual linking).
 */
export async function persistCheckoutSessionOnHoldWithRetry(
  db: Firestore,
  holdRef: DocumentReference,
  holdId: string,
  stripeSessionId: string,
  holdUpdate: Record<string, unknown>,
  firestoreExports: FirestoreExports,
  stripe: Stripe,
  discountAtomicPersist?: DiscountAtomicPersistOnCheckoutSession | null
): Promise<PersistCheckoutSessionResult> {
  const { FieldValue } = firestoreExports;
  const baseHoldUpdate = { ...holdUpdate, sessionCreationInFlight: FieldValue.delete() };
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const outcome = await db.runTransaction(async (tx) => {
        const snap = await tx.get(holdRef);
        if (!snap.exists) return "missing" as const;
        const h = snap.data() as { status?: string; checkoutSessionId?: string };
        if (h.status !== "active") {
          tx.update(holdRef, { sessionCreationInFlight: FieldValue.delete() });
          return "inactive" as const;
        }
        const existing = typeof h.checkoutSessionId === "string" ? h.checkoutSessionId.trim() : "";
        if (existing && existing !== stripeSessionId) {
          tx.update(holdRef, { sessionCreationInFlight: FieldValue.delete() });
          return "lost_race" as const;
        }
        let finalUpdate: Record<string, unknown> = baseHoldUpdate;
        if (discountAtomicPersist) {
          const dSnap = await tx.get(discountAtomicPersist.discountRef);
          if (!dSnap.exists) {
            throw new CheckoutDiscountPersistError("discount_missing", "Invalid or expired code");
          }
          const discountLive = dSnap.data() as Discount;
          const recheck = validateAndApplyDiscount(discountLive, discountAtomicPersist.pricingTotalCents);
          if (!recheck.valid) {
            throw new CheckoutDiscountPersistError(recheck.error, recheck.error);
          }
          if (
            recheck.discountCents !== discountAtomicPersist.expectedDiscountCents ||
            recheck.discount.code !== discountAtomicPersist.expectedCode
          ) {
            throw new CheckoutDiscountPersistError(
              "discount_mismatch",
              "Discount changed while booking; please try again"
            );
          }
          tx.update(discountAtomicPersist.discountRef, {
            usedCount: FieldValue.increment(1),
            updatedAt: FieldValue.serverTimestamp(),
          });
          finalUpdate = {
            ...finalUpdate,
            discountCode: discountAtomicPersist.expectedCode,
            discountCents: recheck.discountCents,
            discountDocId: discountAtomicPersist.discountRef.id,
            updatedAt: FieldValue.serverTimestamp(),
          };
        }
        tx.update(holdRef, finalUpdate);
        return "ok" as const;
      });
      if (outcome === "ok") return { ok: true };
      if (outcome === "lost_race") {
        try {
          await stripe.checkout.sessions.expire(stripeSessionId);
        } catch (ex) {
          console.error("[persistCheckoutSessionOnHoldWithRetry] expire duplicate session failed", stripeSessionId, ex);
        }
        return { ok: false, reason: "lost_race" };
      }
      if (outcome === "inactive") {
        try {
          await stripe.checkout.sessions.expire(stripeSessionId);
        } catch (ex) {
          console.error("[persistCheckoutSessionOnHoldWithRetry] expire session after inactive hold failed", stripeSessionId, ex);
        }
        return { ok: false, reason: "hold_inactive" };
      }
      return { ok: false, reason: "hold_inactive" };
    } catch (e) {
      if (e instanceof CheckoutDiscountPersistError) {
        return { ok: false, reason: "discount_invalid", discountMessage: e.clientMessage };
      }
      lastErr = e;
      if (attempt < 2) await sleep(100 * 2 ** attempt);
    }
  }
  console.error("[persistCheckoutSessionOnHoldWithRetry] Firestore updates failed after retries", {
    holdId,
    stripeSessionId,
    lastErr,
  });
  await writeOperationalAlert({
    type: "checkout_session_hold_persist_failed",
    holdId,
    sessionId: stripeSessionId,
    source: "persistCheckoutSessionOnHoldWithRetry",
    message:
      "Could not persist checkoutSessionId on hold after Stripe session.create; manual association may be needed.",
    lastError: lastErr instanceof Error ? lastErr.message : String(lastErr),
  });
  return { ok: false, reason: "persist_exhausted" };
}

async function resolveFullPaymentIntentIdForCheckoutSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session
): Promise<string | null> {
  const fromSession =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;
  if (fromSession) return fromSession;
  try {
    const expanded = await stripe.checkout.sessions.retrieve(session.id, { expand: ["payment_intent"] });
    const piId =
      typeof expanded.payment_intent === "object" && expanded.payment_intent?.id
        ? expanded.payment_intent.id
        : typeof expanded.payment_intent === "string"
          ? expanded.payment_intent
          : null;
    return piId;
  } catch (retrieveErr) {
    bookingError(
      "create-checkout-session",
      "Could not resolve PaymentIntent for Checkout Session (expanded retrieve failed)",
      retrieveErr,
      { sessionId: session.id }
    );
    return null;
  }
}

/**
 * After `stripe.checkout.sessions.create`: resolve PI id (including expanded retrieve), persist on hold with retry,
 * attach `checkoutSessionId` to PI metadata. On missing PI or exhausted persist, expires the Stripe session.
 */
export async function persistCheckoutSessionAfterStripeSessionCreate(
  stripe: Stripe,
  db: Firestore,
  holdRef: DocumentReference,
  holdId: string,
  session: Stripe.Checkout.Session,
  holdUpdateExtras: Record<string, unknown>,
  firestoreExports: FirestoreExports,
  discountAtomicPersist?: DiscountAtomicPersistOnCheckoutSession | null
): Promise<
  | { ok: true }
  | {
      ok: false;
      reason: "lost_race" | "hold_inactive" | "persist_exhausted" | "discount_invalid";
      discountMessage?: string;
    }
> {
  const piId = await resolveFullPaymentIntentIdForCheckoutSession(stripe, session);
  if (!piId) {
    await writeOperationalAlert({
      type: "checkout_session_persist_no_pi",
      holdId,
      sessionId: session.id,
      source: "persistCheckoutSessionAfterStripeSessionCreate",
      message:
        "Checkout Session created but PaymentIntent id could not be resolved; checkoutSessionId persisted on hold without fullPaymentIntentId for webhook matching.",
    });
    const holdUpdateNoPi = { ...holdUpdateExtras };
    const persistNoPi = await persistCheckoutSessionOnHoldWithRetry(
      db,
      holdRef,
      holdId,
      session.id,
      holdUpdateNoPi,
      firestoreExports,
      stripe,
      discountAtomicPersist
    );
    if (persistNoPi.ok === false && persistNoPi.reason === "persist_exhausted") {
      // Do not expire: let Stripe session timeout; ops can investigate.
    }
    return persistNoPi;
  }
  const holdUpdate = { ...holdUpdateExtras, fullPaymentIntentId: piId };
  const persistResult = await persistCheckoutSessionOnHoldWithRetry(
    db,
    holdRef,
    holdId,
    session.id,
    holdUpdate,
    firestoreExports,
    stripe,
    discountAtomicPersist
  );
  if (persistResult.ok === false && persistResult.reason === "persist_exhausted") {
    try {
      await stripe.checkout.sessions.expire(session.id);
    } catch (ex) {
      console.error("[persistCheckoutSessionAfterStripeSessionCreate] expire after persist exhausted failed", session.id, ex);
    }
  }
  if (persistResult.ok) {
    try {
      const piExisting = await stripe.paymentIntents.retrieve(piId);
      await stripe.paymentIntents.update(piId, {
        metadata: { ...piExisting.metadata, checkoutSessionId: session.id },
      });
    } catch (metaErr) {
      bookingError(
        "create-checkout-session",
        "CRITICAL: Could not attach checkoutSessionId to PaymentIntent metadata",
        metaErr,
        { holdId, sessionId: session.id, paymentIntentIdPrefix: piId.slice(0, 12) }
      );
      await writeOperationalAlert({
        type: "checkout_session_payment_intent_metadata_write_failed",
        severity: "critical",
        holdId,
        sessionId: session.id,
        paymentIntentId: piId,
        source: "persistCheckoutSessionAfterStripeSessionCreate",
        message:
          "Failed to attach checkoutSessionId metadata to PaymentIntent after checkout session create; downstream webhook matching may be degraded.",
        error: metaErr instanceof Error ? metaErr.message : String(metaErr),
      });
    }
  }
  return persistResult;
}

export type CreateStripeCheckoutSessionForHoldResult =
  | { ok: true; session: Stripe.Checkout.Session }
  | {
      ok: false;
      kind: "stripe_create_failed" | "persist_failed";
      /** Set when Stripe session was created but hold persist failed — session may have been expired. */
      sessionId?: string;
      stripeError?: unknown;
      persistReason?: "lost_race" | "hold_inactive" | "persist_exhausted" | "discount_invalid";
      discountMessage?: string;
    };

/**
 * Shared path: create Checkout Session, persist session + PaymentIntent id on the hold (with retry), PI metadata.
 * Call after lock acquisition and optional hold expiry extension. Does not acquire the lock or build line items.
 */
export async function createStripeCheckoutSessionForHold(
  stripe: Stripe,
  db: Firestore,
  holdRef: DocumentReference,
  holdId: string,
  sessionParams: Stripe.Checkout.SessionCreateParams,
  idempotencyKey: string,
  holdUpdateWithoutCheckoutFields: Record<string, unknown>,
  firestoreExports: FirestoreExports,
  discountAtomicPersist?: DiscountAtomicPersistOnCheckoutSession | null
): Promise<CreateStripeCheckoutSessionForHoldResult> {
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(sessionParams, { idempotencyKey });
  } catch (e) {
    return { ok: false, kind: "stripe_create_failed", stripeError: e };
  }
  const holdUpdateExtras: Record<string, unknown> = {
    ...holdUpdateWithoutCheckoutFields,
    checkoutSessionId: session.id,
  };
  const persistOutcome = await persistCheckoutSessionAfterStripeSessionCreate(
    stripe,
    db,
    holdRef,
    holdId,
    session,
    holdUpdateExtras,
    firestoreExports,
    discountAtomicPersist
  );
  if (persistOutcome.ok) {
    return { ok: true, session };
  }
  return {
    ok: false,
    kind: "persist_failed",
    sessionId: session.id,
    persistReason: persistOutcome.reason,
    ...(persistOutcome.reason === "discount_invalid" && persistOutcome.discountMessage
      ? { discountMessage: persistOutcome.discountMessage }
      : {}),
  };
}

/**
 * Delete a Stripe coupon created for this checkout attempt and bump hold paymentAttemptVersion.
 * Call after `createStripeCheckoutSessionForHold` returns non-ok when `stripeCouponId` was newly created
 * (orphaned coupon if session create or hold persist failed).
 */
export async function cleanupOrphanedCoupon(
  stripe: Stripe,
  stripeCouponId: string | undefined,
  holdRef: DocumentReference,
  FieldValue: FirestoreExports["FieldValue"],
  opts?: { skipHoldPaymentAttemptBump?: boolean }
): Promise<void> {
  if (!stripeCouponId) return;
  try {
    await stripe.coupons.del(stripeCouponId);
  } catch (delErr) {
    console.error("[cleanupOrphanedCoupon] Failed to delete orphaned coupon", stripeCouponId, delErr);
  }
  if (opts?.skipHoldPaymentAttemptBump) return;
  try {
    await holdRef.update({ paymentAttemptVersion: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
  } catch (vErr) {
    console.error("[cleanupOrphanedCoupon] Failed to bump paymentAttemptVersion after coupon delete", vErr);
  }
}
