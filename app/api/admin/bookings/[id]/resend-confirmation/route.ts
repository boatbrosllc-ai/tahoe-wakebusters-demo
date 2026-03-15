/**
 * POST /api/admin/bookings/[id]/resend-confirmation
 * Resend the booking confirmation email to the customer. Requires admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import { sendBookingConfirmationEmail } from "@/lib/booking/brevo";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { formatBookingDateTime } from "@/lib/booking/format-booking-datetime";
import { DEFAULT_CANCELLATION_POLICY } from "@/lib/booking/cancellation-policy";
import type { Booking } from "@/lib/booking/types";
import type { Experience } from "@/lib/booking/types";

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
    const bookingSnap = await db.collection("bookings").doc(bookingId).get();
    if (!bookingSnap.exists) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    const booking = bookingSnap.data() as Booking;
    const experienceId = booking.experienceId;

    let boatNameForEmail: string;
    let locationText: string;
    let cancellationPolicyText: string;
    let pricingType: "charter" | "ticketed" | undefined;

    if (experienceId) {
      const expSnap = await db.collection("experiences").doc(experienceId).get();
      if (!expSnap.exists) {
        return NextResponse.json({ error: "Experience not found" }, { status: 404 });
      }
      const exp = expSnap.data() as Experience;
      boatNameForEmail = exp.title ?? "Charter";
      if (booking.boatId) {
        const boatSnap = await db.collection("boats").doc(booking.boatId).get();
        if (boatSnap.exists) {
          boatNameForEmail = (boatSnap.data() as { name?: string }).name ?? boatNameForEmail;
        }
      }
      locationText = exp.location?.addressText ?? "We'll send exact meeting point after booking.";
      cancellationPolicyText = exp.cancellationPolicy?.fullText ?? DEFAULT_CANCELLATION_POLICY;
      pricingType = exp.pricingType;
    } else {
      // Boat-only (legacy) booking: use boat name and generic copy.
      boatNameForEmail = "Charter";
      if (booking.boatId) {
        const boatSnap = await db.collection("boats").doc(booking.boatId).get();
        if (boatSnap.exists) {
          boatNameForEmail = (boatSnap.data() as { name?: string }).name ?? boatNameForEmail;
        }
      }
      locationText = "We'll send exact meeting point after booking.";
      cancellationPolicyText = DEFAULT_CANCELLATION_POLICY;
      pricingType = undefined;
    }

    const parsed = parseSlotId(booking.slotId ?? "");
    const { start, end } = parsed
      ? getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0)
      : { start: new Date(), end: new Date() };
    const startAt = formatBookingDateTime(start);
    const endAt = formatBookingDateTime(end);
    const durationHours = parsed?.durationHours ?? 3;

    const isDeposit =
      booking.status === "deposit_paid" ||
      booking.status === "final_due" ||
      booking.status === "final_processing" ||
      booking.status === "final_paid" ||
      booking.status === "final_requires_action" ||
      booking.status === "final_failed";

    const emailContext = {
      boatName: boatNameForEmail,
      startAt,
      endAt,
      durationHours,
      locationText,
      cancellationPolicyText,
      isDeposit,
      finalChargeAt:
        isDeposit && booking.finalChargeAt
          ? (booking.finalChargeAt as { toDate(): Date }).toDate().toISOString()
          : undefined,
      manageLink: undefined as string | undefined,
      waiverSigningUrl: undefined as string | undefined,
      waiverGroupSigningUrl: undefined as string | undefined,
      pricingType,
    };

    await sendBookingConfirmationEmail(booking, emailContext);

    return NextResponse.json({ ok: true, message: "Confirmation email sent" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFirebaseConfig = /firebase|FIREBASE|config missing|credential|truncated|private key/i.test(message);
    return NextResponse.json(
      { error: message, ...(isFirebaseConfig && { hint: FIREBASE_SETUP_HINT }) },
      { status: isFirebaseConfig ? 503 : 500 }
    );
  }
}
