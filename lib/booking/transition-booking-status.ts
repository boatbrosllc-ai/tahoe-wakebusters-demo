import type { Firestore } from "firebase-admin/firestore";
import type { BookingStatus } from "@/lib/booking/types";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";
import { bookingWarn } from "@/lib/booking/debug";

type AllowedFrom = BookingStatus | BookingStatus[];

export function allowsTransition(from: BookingStatus, to: BookingStatus, transitionSource?: string): boolean {
  if (from === to) return true;
  const defaultTable: Record<BookingStatus, BookingStatus[]> = {
    paid: ["canceled", "refunded"],
    canceled: [],
    refunded: [],
    final_due: ["final_processing", "final_requires_action", "final_failed", "final_paid", "canceled"],
    final_processing: ["final_paid", "final_due", "final_requires_action", "final_failed"],
    final_paid: ["refunded"],
    final_requires_action: ["final_processing", "final_due", "final_failed"],
    final_failed: ["final_due"],
  };
  if (from === "final_failed" && to === "canceled") {
    return transitionSource === "auto_cancel";
  }
  return defaultTable[from]?.includes(to) ?? false;
}

export async function transitionBookingStatus(
  db: Firestore,
  bookingId: string,
  expectedFrom: AllowedFrom,
  to: BookingStatus,
  updatePayload: Record<string, unknown> = {}
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "unexpected_from" | "illegal_transition"; currentStatus?: BookingStatus }> {
  const { FieldValue } = getFirestoreExports();
  const fromSet = new Set(Array.isArray(expectedFrom) ? expectedFrom : [expectedFrom]);
  const transitionSource =
    typeof updatePayload.transitionSource === "string" ? (updatePayload.transitionSource as string) : undefined;
  const payload = { ...updatePayload };
  delete payload.transitionSource;

  let result: { ok: true } | { ok: false; reason: "not_found" | "unexpected_from" | "illegal_transition"; currentStatus?: BookingStatus } =
    { ok: false, reason: "not_found" };
  const transitionLogRef: {
    from?: BookingStatus;
  } = {};

  await db.runTransaction(async (tx) => {
    transitionLogRef.from = undefined;
    const bookingRef = db.collection("bookings").doc(bookingId);
    const snap = await tx.get(bookingRef);
    if (!snap.exists) {
      result = { ok: false, reason: "not_found" };
      return;
    }
    const currentStatus = (snap.data() as { status: BookingStatus }).status;
    if (!fromSet.has(currentStatus)) {
      result = { ok: false, reason: "unexpected_from", currentStatus };
      return;
    }
    if (!allowsTransition(currentStatus, to, transitionSource)) {
      result = { ok: false, reason: "illegal_transition", currentStatus };
      return;
    }
    transitionLogRef.from = currentStatus;
    tx.update(bookingRef, {
      status: to,
      ...payload,
      ...(transitionSource ? { transitionSource } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    result = { ok: true };
  });

  if (transitionLogRef.from !== undefined) {
    bookingWarn("transition-booking-status", "status transitioned", {
      bookingId,
      from: transitionLogRef.from,
      to,
      transitionSource: transitionSource ?? null,
    });
  }

  return result;
}

