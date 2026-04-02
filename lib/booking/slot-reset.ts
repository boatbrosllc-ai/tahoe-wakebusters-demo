import type { DocumentSnapshot, Firestore, Transaction } from "firebase-admin/firestore";
import type { Booking } from "@/lib/booking/types";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";

export type ResetBookingSlotsResult = {
  updated: number;
  /** Slots that were `held` before reset (released hold occupancy). */
  heldSlotsReleased: number;
};

/**
 * Slot doc refs to clear for this booking (boat + experience + slug variants).
 * Exported so callers can run all `tx.get` reads in one explicit phase before any writes.
 */
export function buildBookingSlotResetRefs(
  db: Firestore,
  booking: Booking,
  experienceSlug?: string
): FirebaseFirestore.DocumentReference[] {
  const slotId = booking.slotId;
  const experienceId = booking.experienceId;
  const boatId = booking.boatId;
  if (!slotId) return [];
  const refs = new Map<string, FirebaseFirestore.DocumentReference>();
  if (boatId) refs.set(`boats/${boatId}/slots/${slotId}`, db.collection("boats").doc(boatId).collection("slots").doc(slotId));
  if (experienceId) refs.set(`experiences/${experienceId}/slots/${slotId}`, db.collection("experiences").doc(experienceId).collection("slots").doc(slotId));
  if (experienceId) {
    const variants = getExperienceIdVariants(experienceId, experienceSlug ?? "");
    for (const v of variants) {
      refs.set(`experiences/${v}/slots/${slotId}`, db.collection("experiences").doc(v).collection("slots").doc(slotId));
    }
  }
  return Array.from(refs.values());
}

/**
 * Write-only: open slots from pre-read snapshots (no `tx.get`). Pair with `buildBookingSlotResetRefs` + reads.
 */
export function applyBookingSlotOpensFromSnapshots(
  tx: Transaction,
  bookingId: string,
  _booking: Booking,
  refList: FirebaseFirestore.DocumentReference[],
  snapshots: DocumentSnapshot[]
): ResetBookingSlotsResult {
  const { FieldValue } = getFirestoreExports();
  let updated = 0;
  let heldSlotsReleased = 0;
  const n = Math.min(refList.length, snapshots.length);
  for (let i = 0; i < n; i++) {
    const ref = refList[i]!;
    const snap = snapshots[i]!;
    if (!snap.exists) continue;
    const data = snap.data() as { bookingId?: string | null; status?: string };
    const slotBookingId = typeof data.bookingId === "string" ? data.bookingId.trim() : "";
    if (data.status !== "booked" && data.status !== "held") continue;
    if (slotBookingId && slotBookingId !== bookingId) continue;
    if (data.status === "held") heldSlotsReleased++;
    tx.set(
      ref,
      {
        status: "open",
        holdId: FieldValue.delete(),
        bookingId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    updated++;
  }
  return { updated, heldSlotsReleased };
}

/**
 * Clears booking/held state on all slot doc variants. Uses a two-phase transaction
 * pattern: all `tx.get` reads for candidate slots (sequential — avoids client read-order bugs),
 * optional `betweenReadsAndWrites`, then all `tx.set` writes.
 *
 * @param betweenReadsAndWrites Optional hook after all slot reads and before any
 *   slot writes (e.g. read shared departure inventory in the same transaction).
 */
export async function resetBookingSlotsToOpenInTransaction(
  db: Firestore,
  tx: Transaction,
  bookingId: string,
  booking: Booking,
  experienceSlug?: string,
  opts?: {
    betweenReadsAndWrites?: (tx: Transaction) => void | Promise<void>;
  }
): Promise<ResetBookingSlotsResult> {
  const refList = buildBookingSlotResetRefs(db, booking, experienceSlug);
  const snapshots: DocumentSnapshot[] = [];
  for (const ref of refList) {
    snapshots.push(await tx.get(ref));
  }

  await opts?.betweenReadsAndWrites?.(tx);

  return applyBookingSlotOpensFromSnapshots(tx, bookingId, booking, refList, snapshots);
}
