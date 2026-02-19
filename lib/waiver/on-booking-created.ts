/**
 * Create waiver request when a booking is created.
 * Does not send emails; caller adds waiver link to confirmation and/or sends separate invite based on template flags.
 * Call from convertHoldToBooking (Stripe/webhook flow) and admin POST booking.
 */

import "server-only";
import { getDb } from "@/lib/booking/firebase-admin";
import { parseSlotId, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { formatBookingTime } from "@/lib/booking/format-booking-datetime";
import {
  listTemplates,
  createRequest,
  createGroupToken,
  setBookingWaiverPointer,
  updateRequest,
} from "./firestore";
import { waiverEmailBrevo } from "./email-brevo";
import { getFirestoreExports } from "@/lib/booking/firebase-admin";

export interface CreateWaiverForBookingInput {
  bookingId: string;
  customerEmail: string;
  customerName?: string;
}

export interface CreateWaiverForBookingResult {
  requestId: string;
  signingUrl: string;
  /** Shareable link for other party members to sign the same booking's waiver. */
  groupSigningUrl?: string;
  /** Include this URL in the booking confirmation email. */
  includeInConfirmationEmail: boolean;
  /** Send a separate waiver invite email (caller should call sendWaiverInviteAndMarkSent). */
  sendSeparateWaiverInvite: boolean;
  bookingSummary: { experienceName: string; tripDate: string; startTime?: string; endTime?: string; partySize?: number };
  to: string;
  name: string;
}

/**
 * If an active waiver template exists, create a waiver request and set the booking pointer.
 * Returns result so caller can add signingUrl to confirmation and/or send the separate invite.
 * No-op if no active template or on error (errors are logged, not thrown). Returns null on no-op or error.
 */
export async function createWaiverForBooking(
  input: CreateWaiverForBookingInput
): Promise<CreateWaiverForBookingResult | null> {
  try {
    const templates = await listTemplates();
    const active = templates.find((t) => t.isActive);
    if (!active) return null;

    const { requestId, signingUrl } = await createRequest({
      bookingId: input.bookingId,
      templateId: active.id,
      templateVersion: active.version,
      signerEmail: input.customerEmail.trim(),
    });

    await setBookingWaiverPointer(input.bookingId, {
      requestId,
      status: "pending",
      templateId: active.id,
      templateVersion: active.version,
    });

    const db = getDb();
    const bookingSnap = await db.collection("bookings").doc(input.bookingId).get();
    let experienceName = "Your trip";
    let tripDate = "";
    let startTime: string | undefined;
    let endTime: string | undefined;
    let partySize: number | undefined;

    if (bookingSnap.exists) {
      const b = bookingSnap.data() as {
        experienceId?: string;
        slotId?: string;
        startDateStr?: string;
        partySize?: number;
      };
      tripDate = b.startDateStr ?? "";
      partySize = b.partySize;
      const parsed = b.slotId ? parseSlotId(b.slotId) : null;
      if (parsed) {
        tripDate = parsed.dateStr;
        const { start, end } = getSlotStartEnd(parsed.dateStr, parsed.startHour, parsed.durationHours, parsed.startMinute ?? 0);
        startTime = formatBookingTime(start);
        endTime = formatBookingTime(end);
      }
      if (b.experienceId) {
        const expSnap = await db.collection("experiences").doc(b.experienceId).get();
        if (expSnap.exists) {
          experienceName = (expSnap.data() as { title?: string })?.title ?? b.experienceId;
        }
      }
    }

    const bookingSummary = { experienceName, tripDate, startTime, endTime, partySize };
    const includeInConfirmationEmail = active.includeInConfirmationEmail !== false;
    const sendSeparateWaiverInvite = active.sendSeparateWaiverInvite === true;

    let groupSigningUrl: string | undefined;
    const partyCount = partySize ?? 1;
    if (partyCount > 1) {
      const group = await createGroupToken(input.bookingId, active.id, active.version, partyCount);
      groupSigningUrl = group.groupSigningUrl;
    }

    return {
      requestId,
      signingUrl,
      groupSigningUrl,
      includeInConfirmationEmail,
      sendSeparateWaiverInvite,
      bookingSummary,
      to: input.customerEmail.trim(),
      name: (input.customerName ?? "Guest").trim(),
    };
  } catch (err) {
    console.error("[waiver] createWaiverForBooking failed", input.bookingId, err);
    return null;
  }
}

/**
 * Send the waiver invite email and mark the request as sent. Call after sending confirmation if template has sendSeparateWaiverInvite.
 */
export async function sendWaiverInviteAndMarkSent(
  result: CreateWaiverForBookingResult
): Promise<void> {
  await waiverEmailBrevo.sendWaiverInvite({
    to: result.to,
    name: result.name,
    signingUrl: result.signingUrl,
    bookingSummary: result.bookingSummary,
  });
  const { Timestamp } = getFirestoreExports();
  const now = Timestamp.now();
  await updateRequest(result.requestId, {
    sent: {
      initialSentAt: now,
      lastSentAt: now,
      reminder1SentAt: null,
    },
  });
}
