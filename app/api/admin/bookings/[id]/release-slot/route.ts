import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";
import type { Booking } from "@/lib/booking/types";
import { resetBookingSlotsToOpenInTransaction } from "@/lib/booking/slot-reset";
import { resolveExperienceDocAndSlug } from "@/lib/booking/listing-boat-resolution";
import { writeAdminAuditLog } from "@/lib/booking/admin-audit-log";

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
    const bookingRef = db.collection("bookings").doc(bookingId);
    let updated = 0;
    let slotId: string | null = null;
    let alreadyCanceled = false;
    let mustCancelFirst = false;
    let slotBookingMismatch = false;

    const bookingSnapOuter = await bookingRef.get();
    if (!bookingSnapOuter.exists) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    const bookingOuter = bookingSnapOuter.data() as Booking;
    slotId = typeof bookingOuter.slotId === "string" ? bookingOuter.slotId : null;
    if (!slotId) {
      return NextResponse.json({ error: "Booking is missing slot metadata" }, { status: 400 });
    }
    if (bookingOuter.status !== "canceled") {
      return NextResponse.json({ error: "Booking status does not require slot release" }, { status: 409 });
    }
    const expResolvedOuter = await resolveExperienceDocAndSlug(db, bookingOuter.experienceId);

    await db.runTransaction(async (tx) => {
      const bookingSnap = await tx.get(bookingRef);
      if (!bookingSnap.exists) throw new Error("BOOKING_NOT_FOUND");
      const booking = bookingSnap.data() as Booking;
      if (!slotId) throw new Error("BOOKING_MISSING_SLOT");
      if (booking.status !== "canceled") {
        mustCancelFirst = true;
        return;
      }
      alreadyCanceled = true;
      const slotRef = booking.boatId
        ? db.collection("boats").doc(booking.boatId).collection("slots").doc(slotId)
        : booking.experienceId
          ? db.collection("experiences").doc(booking.experienceId).collection("slots").doc(slotId)
          : null;
      if (!slotRef) {
        throw new Error("BOOKING_MISSING_SLOT_OWNER");
      }
      const slotSnap = await tx.get(slotRef);
      if (!slotSnap.exists) {
        throw new Error("SLOT_NOT_FOUND");
      }
      const slotBookingId = (slotSnap.data() as { bookingId?: string }).bookingId ?? null;
      if (slotBookingId !== bookingId) {
        slotBookingMismatch = true;
        return;
      }
      const bookingForReset = expResolvedOuter
        ? ({ ...booking, experienceId: expResolvedOuter.docId } as Booking)
        : booking;
      const resetResult = await resetBookingSlotsToOpenInTransaction(
        db,
        tx,
        bookingId,
        bookingForReset,
        expResolvedOuter?.slug ?? ""
      );
      updated = resetResult.updated;
    });
    if (mustCancelFirst) {
      return NextResponse.json({ error: "Booking status does not require slot release" }, { status: 409 });
    }
    if (slotBookingMismatch) {
      return NextResponse.json(
        { error: "Slot is not currently assigned to this booking. Use admin cancel flow for slot-release recovery only." },
        { status: 409 }
      );
    }
    void writeAdminAuditLog("booking_release_slot", { bookingId, slotId, updated });
    return NextResponse.json({
      ok: true,
      bookingId,
      slotId,
      updated,
      alreadyCanceled,
      message: "Slot release is only allowed for canceled bookings. Use the cancel flow first.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "BOOKING_NOT_FOUND") return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    if (message === "BOOKING_MISSING_SLOT") {
      return NextResponse.json({ error: "Booking is missing slot metadata" }, { status: 400 });
    }
    if (message === "BOOKING_MISSING_SLOT_OWNER") {
      return NextResponse.json({ error: "Booking is missing slot owner metadata" }, { status: 400 });
    }
    if (message === "SLOT_NOT_FOUND") {
      return NextResponse.json({ error: "Slot not found for this booking" }, { status: 404 });
    }
    await writeOperationalAlert({
      type: "admin_release_slot_failed",
      source: "admin-release-slot",
      bookingId,
      error: message.slice(0, 500),
    }).catch(() => {});
    return NextResponse.json({ error: "Failed to release slot" }, { status: 500 });
  }
}
