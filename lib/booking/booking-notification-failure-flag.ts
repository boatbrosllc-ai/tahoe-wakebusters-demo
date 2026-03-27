import type { Firestore } from "firebase-admin/firestore";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";

/** Marks a booking when confirmation or reminder delivery has permanently failed (ops triage / list filters). */
export async function markBookingNotificationPermanentlyFailed(
  db: Firestore,
  bookingId: string,
  detail: string
): Promise<void> {
  try {
    const { Timestamp } = getFirestoreExports();
    await db.collection("bookings").doc(bookingId).set(
      {
        notificationFailedAt: Timestamp.now(),
        notificationFailureDetail: detail.slice(0, 500),
        notificationFailed: true,
      },
      { merge: true }
    );
  } catch (e) {
    console.error("[booking-notification-failure-flag] update failed", e);
  }
}
