import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { Booking } from "@/lib/booking/types";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import { getExperienceIdVariants } from "@/lib/booking/experience-aliases";

export async function resetBookingSlotsToOpenInTransaction(
  db: Firestore,
  tx: Transaction,
  bookingId: string,
  booking: Booking,
  experienceSlug?: string,
  opts?: { onHeldReleased?: () => void }
): Promise<number> {
  const { FieldValue } = getFirestoreExports();
  const slotId = booking.slotId;
  const experienceId = booking.experienceId;
  const boatId = booking.boatId;
  if (!slotId) return 0;
  const refs = new Map<string, FirebaseFirestore.DocumentReference>();
  if (boatId) refs.set(`boats/${boatId}/slots/${slotId}`, db.collection("boats").doc(boatId).collection("slots").doc(slotId));
  if (experienceId) refs.set(`experiences/${experienceId}/slots/${slotId}`, db.collection("experiences").doc(experienceId).collection("slots").doc(slotId));
  if (experienceId) {
    const variants = getExperienceIdVariants(experienceId, experienceSlug ?? "");
    for (const v of variants) {
      refs.set(`experiences/${v}/slots/${slotId}`, db.collection("experiences").doc(v).collection("slots").doc(slotId));
    }
  }
  let updated = 0;
  for (const ref of Array.from(refs.values())) {
    const snap = await tx.get(ref);
    if (!snap.exists) continue;
    const data = snap.data() as { bookingId?: string | null; status?: string };
    const slotBookingId = typeof data.bookingId === "string" ? data.bookingId.trim() : "";
    if (data.status !== "booked" && data.status !== "held") continue;
    if (slotBookingId && slotBookingId !== bookingId) continue;
    if (data.status === "held") opts?.onHeldReleased?.();
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
  return updated;
}
