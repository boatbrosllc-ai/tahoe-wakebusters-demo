/**
 * Shared Firestore transaction to expire a hold and free its slot (and shared-departure inventory).
 * Used by POST /api/booking/release-hold and cron/tooling.
 */

import { getDepartureInventoryRef, releaseCapacity } from "@/lib/booking/shared-departure-inventory";
import { parseSlotId, parseSlotIdRelaxed } from "@/lib/booking/experience-slots";
import type { Booking, Hold, Slot } from "@/lib/booking/types";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";

/**
 * Re-reads the hold inside the transaction and only performs slot/capacity/discount
 * side effects when transitioning status from active → expired (avoids double-decrement
 * when release races cleanup or duplicate release calls).
 */
export async function executeReleaseHoldTransaction(
  db: Firestore,
  holdId: string
): Promise<{ released: true } | { released: false; message: string }> {
  const { FieldValue } = getFirestoreExports();
  const holdRef = db.collection("holds").doc(holdId);

  let outcome: { released: true } | { released: false; message: string } = {
    released: false,
    message: "Hold already released or converted",
  };

  await db.runTransaction(async (tx) => {
    const holdSnap = await tx.get(holdRef);
    if (!holdSnap.exists) {
      outcome = { released: false, message: "Hold not found or already released" };
      return;
    }
    const hold = holdSnap.data() as Hold;
    if (hold.status !== "active") {
      outcome = { released: false, message: "Hold already released or converted" };
      return;
    }

    const experienceId = hold.experienceId as string | undefined;
    const boatId = hold.boatId as string | undefined;
    const slotId = hold.slotId as string;
    if (!slotId || (!experienceId && !boatId)) {
      throw new Error("Invalid hold");
    }

    const slotRef = boatId
      ? db.collection("boats").doc(boatId).collection("slots").doc(slotId)
      : db.collection("experiences").doc(experienceId!).collection("slots").doc(slotId);

    const isSharedHold = (hold as { bookingMode?: string }).bookingMode === "shared";
    const resolveSharedReleaseDateStr = (): string => {
      const startDateStr = (hold as { startDateStr?: string }).startDateStr;
      if (typeof startDateStr === "string" && startDateStr.trim() !== "") return startDateStr.trim();
      const strictDateStr = parseSlotId(hold.slotId)?.dateStr;
      if (strictDateStr) return strictDateStr;
      const relaxedDateStr = parseSlotIdRelaxed(hold.slotId)?.dateStr;
      if (relaxedDateStr) return relaxedDateStr;
      return "";
    };
    const dateStr = resolveSharedReleaseDateStr();

    let discountDocRef: DocumentReference | null = null;
    const discountDocId = (hold as { discountDocId?: string }).discountDocId;
    const discountCode = (hold as { discountCode?: string }).discountCode;
    if (discountDocId) {
      discountDocRef = db.collection("discounts").doc(discountDocId);
    } else if (discountCode) {
      const discountSnap = await tx.get(db.collection("discounts").where("code", "==", discountCode).limit(1));
      if (!discountSnap.empty) discountDocRef = discountSnap.docs[0].ref;
    }

    const applyDiscountDecrementTx = async () => {
      if (!discountDocRef) return;
      const dSnap = await tx.get(discountDocRef);
      if (dSnap.exists) {
        const d = dSnap.data() as { usedCount?: number };
        const nextCount = Math.max(0, (d.usedCount ?? 0) - 1);
        tx.update(discountDocRef, { usedCount: nextCount, updatedAt: FieldValue.serverTimestamp() });
      }
    };

    const slotSnap = await tx.get(slotRef);
    if (!slotSnap.exists) {
      if (isSharedHold && experienceId && dateStr) {
        const inventoryRef = getDepartureInventoryRef(db, experienceId, dateStr);
        await releaseCapacity(tx, inventoryRef, hold.partySize);
      } else if (isSharedHold) {
        void writeOperationalAlert({
          type: "release_hold_missing_date_str",
          source: "release-hold-transaction",
          holdId,
          experienceId: experienceId ?? null,
          slotId,
          hint: "Shared hold was expired without capacity release because startDateStr/slot date could not be resolved.",
        }).catch(() => {});
      }
      tx.update(holdRef, {
        status: "expired",
        rollbackPending: FieldValue.delete(),
        rollbackPendingExpiresAt: FieldValue.delete(),
      });
      await applyDiscountDecrementTx();
      outcome = { released: true };
      return;
    }
    const slot = slotSnap.data() as Slot;
    if (slot.holdId !== holdId) {
      if (isSharedHold && experienceId && dateStr) {
        const inventoryRef = getDepartureInventoryRef(db, experienceId, dateStr);
        await releaseCapacity(tx, inventoryRef, hold.partySize);
      } else if (isSharedHold) {
        void writeOperationalAlert({
          type: "release_hold_missing_date_str",
          source: "release-hold-transaction",
          holdId,
          experienceId: experienceId ?? null,
          slotId,
          hint: "Shared hold was expired without capacity release because startDateStr/slot date could not be resolved.",
        }).catch(() => {});
      }
      tx.update(holdRef, {
        status: "expired",
        rollbackPending: FieldValue.delete(),
        rollbackPendingExpiresAt: FieldValue.delete(),
      });
      await applyDiscountDecrementTx();
      outcome = { released: true };
      return;
    }
    tx.update(slotRef, {
      status: "open",
      holdId: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (isSharedHold && experienceId && dateStr) {
      const inventoryRef = getDepartureInventoryRef(db, experienceId, dateStr);
      await releaseCapacity(tx, inventoryRef, hold.partySize);
    } else if (isSharedHold) {
      void writeOperationalAlert({
        type: "release_hold_missing_date_str",
        source: "release-hold-transaction",
        holdId,
        experienceId: experienceId ?? null,
        slotId,
        hint: "Shared hold was expired without capacity release because startDateStr/slot date could not be resolved.",
      }).catch(() => {});
    }
    tx.update(holdRef, {
      status: "expired",
      rollbackPending: FieldValue.delete(),
      rollbackPendingExpiresAt: FieldValue.delete(),
    });
    await applyDiscountDecrementTx();
    outcome = { released: true };
  });

  return outcome;
}

/**
 * Transitions a final_failed booking to canceled and releases slot/inventory atomically.
 * Uses the same transaction release semantics as hold release.
 */
export async function executeFinalFailedBookingReleaseTransaction(
  db: Firestore,
  bookingId: string
): Promise<{ released: true } | { released: false; message: string }> {
  const { FieldValue } = getFirestoreExports();
  const bookingRef = db.collection("bookings").doc(bookingId);
  let outcome: { released: true } | { released: false; message: string } = {
    released: false,
    message: "Booking not releasable",
  };

  await db.runTransaction(async (tx) => {
    const bookingSnap = await tx.get(bookingRef);
    if (!bookingSnap.exists) {
      outcome = { released: false, message: "Booking not found" };
      return;
    }
    const booking = bookingSnap.data() as Booking;
    if (booking.status !== "final_failed") {
      outcome = { released: false, message: "Booking not in final_failed status" };
      return;
    }

    const slotId = booking.slotId;
    const boatId = booking.boatId;
    const experienceId = booking.experienceId;
    if (!slotId || (!boatId && !experienceId)) {
      outcome = { released: false, message: "Booking missing slot/owner" };
      return;
    }
    const slotRef = boatId
      ? db.collection("boats").doc(boatId).collection("slots").doc(slotId)
      : db.collection("experiences").doc(experienceId!).collection("slots").doc(slotId);
    const slotSnap = await tx.get(slotRef);
    if (slotSnap.exists) {
      const slot = slotSnap.data() as Slot;
      const slotBookingId = typeof slot.bookingId === "string" ? slot.bookingId : "";
      if (!slotBookingId || slotBookingId === bookingId) {
        tx.update(slotRef, {
          status: "open",
          holdId: FieldValue.delete(),
          bookingId: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    const expSnap = experienceId ? await tx.get(db.collection("experiences").doc(experienceId)) : null;
    const pricingType = expSnap?.exists ? ((expSnap.data() as { pricingType?: string }).pricingType ?? "") : "";
    if (pricingType === "ticketed" && experienceId) {
      const startDateStr =
        booking.startDateStr?.trim() ||
        parseSlotId(slotId)?.dateStr ||
        parseSlotIdRelaxed(slotId)?.dateStr ||
        "";
      if (startDateStr) {
        const inventoryRef = getDepartureInventoryRef(db, experienceId, startDateStr);
        await releaseCapacity(tx, inventoryRef, Math.max(0, booking.partySize ?? 0));
      }
    }

    tx.update(bookingRef, {
      status: "canceled",
      updatedAt: FieldValue.serverTimestamp(),
    });
    outcome = { released: true };
  });

  return outcome;
}
