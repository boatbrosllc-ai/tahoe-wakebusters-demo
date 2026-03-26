/**
 * Per-departure capacity lock for shared ticketed experiences.
 * A single document per (experienceId, dateStr) is read and updated in transactions
 * so concurrent hold requests conflict and retry safely.
 */

import type { Firestore, DocumentReference, Transaction } from "firebase-admin/firestore";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";

const COLLECTION = "departureInventory";

function alertNegativeReservedSeats(inventoryRef: DocumentReference, observedValue: number, context: string): void {
  if (observedValue >= 0) return;
  void writeOperationalAlert({
    type: "departure_inventory_reserved_negative",
    source: "shared-departure-inventory",
    context,
    inventoryDocPath: inventoryRef.path,
    observedReservedSeats: observedValue,
  }).catch(() => {});
}

/** Document ID: one per experience per date. */
export function getDepartureInventoryRef(db: Firestore, experienceId: string, dateStr: string): DocumentReference {
  const id = `${experienceId}_${dateStr}`;
  return db.collection(COLLECTION).doc(id);
}

/**
 * In a transaction: read inventory doc, ensure reservedSeats + partySize <= capacity (sold already counted by caller).
 * Then increment reservedSeats by partySize and merge-update the doc.
 * Caller must pass sold = count from bookings for this departure; capacity is the max for the departure.
 */
export async function reserveCapacity(
  tx: Transaction,
  inventoryRef: DocumentReference,
  capacity: number,
  partySize: number,
  sold: number,
  options?: { preReadReservedSeats?: number }
): Promise<void> {
  const { FieldValue } = getFirestoreExports();
  let reservedSeats: number;
  if (typeof options?.preReadReservedSeats === "number") {
    reservedSeats = options.preReadReservedSeats;
  } else {
    const snap = await tx.get(inventoryRef);
    reservedSeats = snap.exists ? ((snap.data() as { reservedSeats?: number }).reservedSeats ?? 0) : 0;
  }
  if (sold + reservedSeats + partySize > capacity) {
    const available = Math.max(0, capacity - sold - reservedSeats);
    throw new Error(
      available === 0
        ? "This date is sold out."
        : `Only ${available} ticket${available === 1 ? "" : "s"} remaining for this date.`
    );
  }
  tx.set(inventoryRef, {
    reservedSeats: reservedSeats + partySize,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

/**
 * In a transaction: decrement reservedSeats by partySize (e.g. when releasing or expiring a hold).
 */
export async function releaseCapacity(
  tx: Transaction,
  inventoryRef: DocumentReference,
  partySize: number
): Promise<void> {
  const { FieldValue } = getFirestoreExports();
  const snap = await tx.get(inventoryRef);
  const current = snap.exists ? ((snap.data() as { reservedSeats?: number }).reservedSeats ?? 0) : 0;
  alertNegativeReservedSeats(inventoryRef, current, "releaseCapacity_pre_read");
  const next = Math.max(0, current - partySize);
  tx.set(inventoryRef, {
    reservedSeats: next,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

/**
 * Apply a net change to reserved seats using pre-read state (read-before-write).
 * Use this when resizing a hold: read reservedSeats once, then apply delta in a single write.
 * For delta > 0 validates that sold + currentReserved + delta <= capacity.
 * For delta < 0 newReserved = max(0, currentReserved + delta).
 */
export function applyNetCapacityChange(
  tx: Transaction,
  inventoryRef: DocumentReference,
  capacity: number,
  sold: number,
  currentReserved: number,
  delta: number
): void {
  const { FieldValue } = getFirestoreExports();
  alertNegativeReservedSeats(inventoryRef, currentReserved, "applyNetCapacityChange_pre_read");
  const newReserved = Math.max(0, currentReserved + delta);
  if (delta > 0 && sold + newReserved > capacity) {
    const available = Math.max(0, capacity - sold - currentReserved);
    throw new Error(
      available === 0
        ? "This date is sold out."
        : `Only ${available} ticket${available === 1 ? "" : "s"} remaining for this date.`
    );
  }
  tx.set(
    inventoryRef,
    {
      reservedSeats: newReserved,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Read current reserved seats from inventory (use inside transaction before applyNetCapacityChange).
 */
export async function getReservedSeats(
  tx: Transaction,
  inventoryRef: DocumentReference
): Promise<number> {
  const snap = await tx.get(inventoryRef);
  return snap.exists ? ((snap.data() as { reservedSeats?: number }).reservedSeats ?? 0) : 0;
}

/**
 * Re-validate capacity before finalizing a shared booking: ensure sold + reservedSeats <= capacity
 * and reservedSeats >= holdPartySize, then decrement reservedSeats by holdPartySize.
 * Caller must compute sold from bookings in the same transaction.
 */
export async function checkCapacityAndRelease(
  tx: Transaction,
  inventoryRef: DocumentReference,
  capacity: number,
  sold: number,
  holdPartySize: number,
  options?: { preReadReservedSeats?: number }
): Promise<void> {
  const { FieldValue } = getFirestoreExports();
  let reservedSeats: number;
  if (typeof options?.preReadReservedSeats === "number") {
    reservedSeats = options.preReadReservedSeats;
  } else {
    const snap = await tx.get(inventoryRef);
    reservedSeats = snap.exists ? ((snap.data() as { reservedSeats?: number }).reservedSeats ?? 0) : 0;
  }
  alertNegativeReservedSeats(inventoryRef, reservedSeats, "checkCapacityAndRelease_pre_read");
  if (reservedSeats < holdPartySize) {
    throw new Error("Shared departure capacity state inconsistent");
  }
  if (sold + reservedSeats > capacity) {
    throw new Error("This date is over capacity; booking cannot be completed.");
  }
  const next = Math.max(0, reservedSeats - holdPartySize);
  tx.set(inventoryRef, {
    reservedSeats: next,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}
