import { NextRequest, NextResponse } from "next/server";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { assertCronPostAuthorized } from "@/lib/booking/cron-auth";
import { BOOKING_STATUSES_SLOT_TAKEN, type BookingStatus } from "@/lib/booking/types";

const PAGE_SIZE = 150;

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
            const st = (bookingSnap.data() as { status?: BookingStatus }).status;
            shouldReopen = !BOOKING_STATUSES_SLOT_TAKEN.has(st as BookingStatus);
          }
        }
        if (shouldReopen) {
          await slotDoc.ref.update({
            status: "open",
            bookingId: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          reopened++;
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
