/**
 * POST /api/admin/bookings/[id]/cancel
 * Cancel a booking (set status to "canceled") and release the slot so it becomes available again.
 * Requires admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import type { Booking } from "@/lib/booking/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id: bookingId } = await params;
  if (!bookingId) return NextResponse.json({ error: "Missing booking id" }, { status: 400 });

  try {
    const db = getDb();
    const { FieldValue } = getFirestoreExports();
    const bookingRef = db.collection("bookings").doc(bookingId);
    const bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    const booking = bookingSnap.data() as Booking;
    if (booking.status === "canceled" || booking.status === "refunded") {
      return NextResponse.json({ ok: true, already: true });
    }

    const experienceId = booking.experienceId;
    const slotId = booking.slotId;
    if (!experienceId || !slotId) {
      return NextResponse.json({ error: "Booking has no experience or slot" }, { status: 400 });
    }

    const slotRef = db.collection("experiences").doc(experienceId).collection("slots").doc(slotId);
    const slotSnap = await slotRef.get();
    if (!slotSnap.exists) {
      await bookingRef.update({ status: "canceled" });
      return NextResponse.json({ ok: true, slotReleased: false });
    }
    const slot = slotSnap.data() as { status?: string; bookingId?: string };
    if (slot.status !== "booked" || slot.bookingId !== bookingId) {
      await bookingRef.update({ status: "canceled" });
      return NextResponse.json({ ok: true, slotReleased: false });
    }

    await db.runTransaction(async (tx) => {
      tx.update(bookingRef, { status: "canceled" });
      tx.update(slotRef, {
        status: "open",
        holdId: FieldValue.delete(),
        bookingId: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ ok: true, slotReleased: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
