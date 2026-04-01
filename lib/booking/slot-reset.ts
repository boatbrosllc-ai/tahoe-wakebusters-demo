import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { Booking } from "@/lib/booking/types";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";

export type ResetBookingSlotsResult = {
  updated: number;
  /** Slots that were `held` before reset (released hold occupancy). */
  heldSlotsReleased: number;
};

/**
 * Clears booking/held state on all slot doc variants. Uses a two-phase transaction
 * pattern: all `tx.get` reads for candidate slots, then all `tx.set` writes, so
 * Firestore does not see reads after writes.
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
  const { FieldValue } = getFirestoreExports();
  const slotId = booking.slotId;
  const experienceId = booking.experienceId;
  const boatId = booking.boatId;
  if (!slotId) return { updated: 0, heldSlotsReleased: 0 };
  const refs = new Map<string, FirebaseFirestore.DocumentReference>();
  if (boatId) refs.set(`boats/${boatId}/slots/${slotId}`, db.collection("boats").doc(boatId).collection("slots").doc(slotId));
  if (experienceId) refs.set(`experiences/${experienceId}/slots/${slotId}`, db.collection("experiences").doc(experienceId).collection("slots").doc(slotId));
  if (experienceId) {
    const variants = getExperienceIdVariants(experienceId, experienceSlug ?? "");
    for (const v of variants) {
      refs.set(`experiences/${v}/slots/${slotId}`, db.collection("experiences").doc(v).collection("slots").doc(slotId));
    }
  }

  const refList = Array.from(refs.values());
  const snapshots = await Promise.all(refList.map((ref) => tx.get(ref)));

  await opts?.betweenReadsAndWrites?.(tx);

  let updated = 0;
  let heldSlotsReleased = 0;
  for (let i = 0; i < refList.length; i++) {
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
