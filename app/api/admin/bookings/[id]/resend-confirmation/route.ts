/**
 * POST /api/admin/bookings/[id]/resend-confirmation
 * Resend the booking confirmation email to the customer. Requires admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, FIREBASE_SETUP_HINT } from "@/lib/admin-auth-firebase";
import { getDb } from "@/lib/booking/firebase-admin";
import { sendBookingConfirmationEmail } from "@/lib/booking/brevo";
import { logEmailSent } from "@/lib/booking/email-log";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { formatBookingDateTime } from "@/lib/booking/format-booking-datetime";
import { DEFAULT_CANCELLATION_POLICY } from "@/lib/booking/cancellation-policy";
import {
  getRequestById,
  buildWaiverSigningUrlFromTokenId,
  getActiveGroupSigningUrlForBooking,
} from "@/lib/waiver/firestore";
import { isDepositMode } from "@/lib/booking/deposit-mode";
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

    const RESENDABLE_STATUSES: Booking["status"][] = [
      "paid",
      "final_due",
      "final_paid",
      "final_requires_action",
      "final_failed",
      "final_processing",
    ];
    if (!RESENDABLE_STATUSES.includes(booking.status)) {
      return NextResponse.json(
        { error: `Cannot resend confirmation for booking with status "${booking.status}". Only paid or final-due bookings can receive a resend.` },
        { status: 400 }
      );
    }

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
    if (!parsed) {
      return NextResponse.json(
        {
          error: "Invalid or missing slot ID. Repair the booking slot data before resending the confirmation.",
          code: "INVALID_SLOT_ID",
        },
        { status: 400 }
      );
    }
    const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
    const startAt = formatBookingDateTime(start);
    const endAt = formatBookingDateTime(end);
    const durationHours = parsed.durationHours ?? 3;

    let waiverSigningUrl: string | undefined;
    let waiverGroupSigningUrl: string | undefined;
    if (booking.waiver?.requestId && booking.waiver?.status === "pending") {
      const req = await getRequestById(booking.waiver.requestId);
      if (req?.status === "pending") {
        if (req.signingTokenId) {
          waiverSigningUrl = buildWaiverSigningUrlFromTokenId(req.signingTokenId);
        } else if (req.signingUrl) {
          waiverSigningUrl = req.signingUrl;
        }
        const party = booking.partySize ?? 1;
        if (party > 1) {
          waiverGroupSigningUrl =
            req.groupSigningUrl ?? (await getActiveGroupSigningUrlForBooking(bookingId)) ?? undefined;
        }
      }
    }

    const addonsById = new Map<string, { name?: string }>();
    if (experienceId && (booking.addonSelections?.length ?? 0) > 0) {
      const addonsSnap = await db.collection("experiences").doc(experienceId).collection("addons").get();
      addonsSnap.docs.forEach((d) => addonsById.set(d.id, d.data() as { name?: string }));
    }
    const addonsSummary =
      (booking.addonSelections?.length ?? 0) > 0
        ? (booking.addonSelections ?? [])
            .map((sel) => `${addonsById.get(sel.addonId)?.name ?? sel.addonId}: qty ${sel.qty}`)
            .join(", ")
        : "None";

    const isDeposit = isDepositMode(booking);
    // Do not treat final_paid as upcoming-charge: remaining balance is already settled.
    const remainingAlreadyCharged = booking.status === "final_paid";

    const emailContext = {
      boatName: boatNameForEmail,
      startAt,
      endAt,
      durationHours,
      locationText,
      cancellationPolicyText,
      isDeposit,
      remainingAlreadyCharged,
      finalChargeAt:
        isDeposit && !remainingAlreadyCharged && booking.finalChargeAt
          ? (booking.finalChargeAt as { toDate(): Date }).toDate().toISOString()
          : undefined,
      manageLink: undefined as string | undefined,
      waiverSigningUrl,
      waiverGroupSigningUrl,
      pricingType,
      addonsSummary,
    };

    const { subject } = await sendBookingConfirmationEmail(booking, emailContext, {
      idempotencyKey: `${bookingId}_booking_confirmation_resend`,
    });
    await logEmailSent({
      to: booking.customer?.email ?? "",
      toName: booking.customer?.name,
      templateId: "booking_confirmation",
      subject,
      bookingId,
    }).catch((err) => console.error("[resend-confirmation] logEmailSent failed", err));

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
