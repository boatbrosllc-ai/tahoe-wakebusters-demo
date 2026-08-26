/**
 * POST /api/admin/bookings/[id]/create-waiver
 * Retries waiver creation after reschedule failures (pendingWaiverCreation queue).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import { createWaiverForBooking, sendWaiverInviteAndMarkSent } from "@/lib/waiver/on-booking-created";
import type { Booking } from "@/lib/booking/types";
import { writeAdminAuditLog } from "@/lib/booking/admin-audit-log";
import { requireFeatureResponse } from "@/lib/plan";

export async function POST(request: NextRequest, {
  params }: { params: Promise<{ id: string }> }) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("waivers");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;

  const { id: bookingId } = await params;
  if (!bookingId?.trim()) {
    return NextResponse.json({ error: "Missing booking id" }, { status: 400 });
  }

  try {
    const db = getDb();
    const ref = db.collection("bookings").doc(bookingId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    const b = snap.data() as Booking;
    const email = b.customer?.email?.trim() ?? "";
    const name = b.customer?.name ?? "";
    if (!email) {
      return NextResponse.json({ error: "Booking has no customer email" }, { status: 400 });
    }

    const waiverResult = await createWaiverForBooking({
      bookingId,
      customerEmail: email,
      customerName: name,
    });
    if (waiverResult?.sendSeparateWaiverInvite) {
      await sendWaiverInviteAndMarkSent(waiverResult);
    }

    await db.collection("pendingWaiverCreation").doc(bookingId).delete().catch(() => {});
    await writeAdminAuditLog("booking_create_waiver_manual", { bookingId });

    return NextResponse.json({ ok: true, bookingId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
