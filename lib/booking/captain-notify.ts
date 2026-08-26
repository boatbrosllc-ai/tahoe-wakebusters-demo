import "server-only";

import { getDb } from "@/lib/booking/firebase-admin";
import type { Booking, Experience } from "@/lib/booking/types";
import { parseSlotIdRelaxed, getSlotStartEnd } from "@/lib/booking/experience-slots";
import { formatBookingDate, formatBookingTime } from "@/lib/booking/format-booking-datetime";
import { emailFieldsFromExperience } from "@/lib/booking/experience-email-logistics";
import { readAssignedCaptain } from "@/lib/admin/assigned-captain";
import type { CaptainTripEmailKind, CaptainTripEmailParams } from "@/lib/booking/email-templates";
import { sendCaptainTripEmail } from "@/lib/booking/brevo";

export async function buildCaptainTripEmailParams(
  bookingId: string,
  booking: Booking,
  assignedByName = ""
): Promise<CaptainTripEmailParams> {
  const db = getDb();
  let experienceName = "Charter";
  let boatName = "—";
  let locationText = "";
  if (booking.experienceId) {
    const expSnap = await db.collection("experiences").doc(booking.experienceId).get();
    if (expSnap.exists) {
      const exp = expSnap.data() as Experience;
      experienceName = exp.title?.trim() || experienceName;
      locationText = emailFieldsFromExperience(exp).locationText;
    }
  }
  if (booking.boatId) {
    const boatSnap = await db.collection("boats").doc(booking.boatId).get();
    if (boatSnap.exists) {
      boatName = (boatSnap.data() as { name?: string }).name?.trim() || booking.boatId;
    }
  }
  const parsed = parseSlotIdRelaxed(booking.slotId ?? "");
  let tripDate = booking.startDateStr ?? "";
  let startTime = "";
  let endTime = "";
  let startAtIso: string | undefined;
  let endAtIso: string | undefined;
  if (parsed) {
    const { start, end } = getSlotStartEnd(
      parsed.dateStr,
      parsed.startHour,
      parsed.durationHours,
      parsed.startMinute ?? 0
    );
    tripDate = formatBookingDate(start);
    startTime = formatBookingTime(start);
    endTime = formatBookingTime(end);
    startAtIso = start.toISOString();
    endAtIso = end.toISOString();
  }
  const assigned = readAssignedCaptain(booking);
  return {
    captainName: assigned?.name ?? "",
    experienceName,
    boatName,
    tripDate,
    startTime,
    endTime,
    guestName: booking.customer?.name?.trim() || "—",
    guestPhone: booking.customer?.phone?.trim() || "—",
    partySize: booking.partySize ?? null,
    locationText,
    specialNotes: booking.specialNotes?.trim() || "",
    operatorNotes: booking.operatorNotes?.trim() || "",
    assignedByName: assignedByName || assigned?.assignedBy || "",
    ...(startAtIso && endAtIso ? { startAtIso, endAtIso } : {}),
  };
}

export async function notifyCaptainTrip(opts: {
  bookingId: string;
  booking: Booking;
  toEmail: string;
  captainName: string;
  kind: CaptainTripEmailKind;
  assignedByName?: string;
}): Promise<void> {
  const to = opts.toEmail.trim().toLowerCase();
  if (!to || !to.includes("@")) return;
  const params = await buildCaptainTripEmailParams(opts.bookingId, opts.booking, opts.assignedByName ?? "");
  params.captainName = opts.captainName.trim() || params.captainName || to;
  const { logNotificationSent } = await import("@/lib/booking/email-log");
  try {
    const result = await sendCaptainTripEmail({
      to,
      captainName: params.captainName,
      kind: opts.kind,
      params,
      idempotencyKey: `${opts.bookingId}_captain_${opts.kind}_${to}_${Date.now()}`.slice(0, 120),
    });
    await logNotificationSent({
      channel: "email",
      to,
      toName: params.captainName,
      templateId: opts.kind === "unassigned" || opts.kind === "cancelled" ? "captain_unassigned" : "captain_assignment",
      subject: result.subject,
      bookingId: opts.bookingId,
      audience: "staff",
    }).catch((err) => console.error("[captain-notify] logNotificationSent failed", err));
  } catch (err) {
    console.error("[captain-notify] send failed", opts.bookingId, opts.kind, err);
    throw err;
  }
}
