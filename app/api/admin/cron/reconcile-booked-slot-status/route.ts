import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { assertCronPostAuthorized } from "@/lib/booking/cron-auth";
import { BOOKING_STATUSES_SLOT_TAKEN, type BookingStatus } from "@/lib/booking/types";

const PAGE_SIZE = 150;
const FINAL_FAILED_RELEASE_SLA_HOURS = (() => {
  const n = parseInt(process.env.FINAL_FAILED_RELEASE_SLA_HOURS ?? "6", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 24 * 30) : 6;
})();

export async function POST(request: NextRequest) {
  const authErr = await assertCronPostAuthorized(request);
  if (authErr) return authErr;
  try {
    const db = getDb();
    const { FieldValue } = getFirestoreExports();
    let scanned = 0;
    let reopened = 0;
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    while (true) {
      let q = db.collectionGroup("slots").where("status", "==", "booked").limit(PAGE_SIZE);
      if (cursor) q = q.startAfter(cursor);
      const snap = await q.get();
      if (snap.empty) break;
      scanned += snap.size;

      for (const slotDoc of snap.docs) {
        const data = slotDoc.data() as { bookingId?: string };
        const bookingId = typeof data.bookingId === "string" ? data.bookingId.trim() : "";
        let shouldReopen = false;
        if (!bookingId) {
          shouldReopen = true;
        } else {
          const bookingSnap = await db.collection("bookings").doc(bookingId).get();
          if (!bookingSnap.exists) {
            shouldReopen = true;
          } else {
            const b = bookingSnap.data() as { status?: BookingStatus; finalChargeAt?: { toDate(): Date } };
            const st = b.status;
            if (st === "final_failed") {
              const finalChargeAt = b.finalChargeAt?.toDate?.();
              const cutoff = new Date(Date.now() - FINAL_FAILED_RELEASE_SLA_HOURS * 60 * 60 * 1000);
              shouldReopen = !!finalChargeAt && finalChargeAt <= cutoff;
            } else {
              shouldReopen = !BOOKING_STATUSES_SLOT_TAKEN.has(st as BookingStatus);
            }
          }
        }
        if (shouldReopen) {
          const expectedBookingId = bookingId;
          const didReopen = await db.runTransaction(async (tx) => {
            const fresh = await tx.get(slotDoc.ref);
            if (!fresh.exists) return false;
            const fd = fresh.data() as { bookingId?: string };
            const currentBookingId =
              typeof fd.bookingId === "string" ? fd.bookingId.trim() : "";
            if (currentBookingId !== expectedBookingId) return false;
            tx.update(slotDoc.ref, {
              status: "open",
              bookingId: FieldValue.delete(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            return true;
          });
          if (didReopen) reopened++;
        }
      }
      if (snap.size < PAGE_SIZE) break;
      cursor = snap.docs[snap.docs.length - 1];
    }

    return NextResponse.json({ ok: true, scanned, reopened });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
