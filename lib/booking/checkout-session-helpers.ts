/**
 * Shared helpers for checkout session creation and rollback.
 * Used by create-checkout-session and create-checkout-session-direct to avoid duplicating rollback logic.
 */

import type { Firestore, DocumentReference } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { parseSlotId } from "@/lib/booking/experience-slots";
import { getDepartureInventoryRef, getReservedSeats } from "@/lib/booking/shared-departure-inventory";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";

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
export async function rollbackCheckoutSession(
  db: Firestore,
  holdId: string,
  hold: HoldLike,
  firestoreExports: FirestoreExports
): Promise<void> {
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
      tx.update(holdRef, { status: "expired", sessionCreationInFlight: FieldValue.delete() });

      const discountDocId = holdData.discountDocId ?? (hold as { discountDocId?: string }).discountDocId;
      const discountCode = holdData.discountCode ?? hold.discountCode;
      if (discountDocId) {
        const discountRef = db.collection("discounts").doc(discountDocId);
        const discountSnap = await tx.get(discountRef);
        if (discountSnap.exists) {
          const d = discountSnap.data() as { usedCount?: number };
          const nextCount = Math.max(0, (d.usedCount ?? 0) - 1);
          tx.update(discountRef, { usedCount: nextCount, updatedAt: FieldValue.serverTimestamp() });
        }
      } else if (discountCode && discountCode.trim()) {
        const discountSnap = await tx.get(
          db.collection("discounts").where("code", "==", discountCode.trim()).limit(1)
        );
        if (!discountSnap.empty) {
          const ref = discountSnap.docs[0].ref;
          const d = discountSnap.docs[0].data() as { usedCount?: number };
          const nextCount = Math.max(0, (d.usedCount ?? 0) - 1);
          tx.update(ref, { usedCount: nextCount, updatedAt: FieldValue.serverTimestamp() });
        }
      }
    });
  } catch (rollbackErr) {
    console.error("[rollbackCheckoutSession] rollback failed", { holdId, err: rollbackErr });
  }
}

/** Concurrent create-checkout-session calls: ignore stale in-flight markers after this window. */
export const SESSION_CREATION_IN_FLIGHT_MAX_AGE_MS = 30_000;

export type CheckoutSessionMode = "embedded" | "redirect";

export type AcquireCheckoutSessionLockResult =
  | { kind: "proceed" }
  | { kind: "use_existing"; checkoutSessionId: string }
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
      if (existingCs && modeMatches) return { kind: "use_existing", checkoutSessionId: existingCs };
      if (existingCs && !modeMatches) return { kind: "proceed" };
      return { kind: "conflict" };
    }
    tx.update(holdRef, { sessionCreationInFlight: Timestamp.now() });
    return { kind: "proceed" };
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type PersistCheckoutSessionResult =
  | { ok: true }
  | { ok: false; reason: "lost_race" | "hold_inactive" | "persist_exhausted" };

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
  stripe: Stripe
): Promise<PersistCheckoutSessionResult> {
  const { FieldValue } = firestoreExports;
  const finalUpdate = { ...holdUpdate, sessionCreationInFlight: FieldValue.delete() };
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
