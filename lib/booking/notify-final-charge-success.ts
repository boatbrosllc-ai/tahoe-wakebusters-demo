/**
 * Idempotent final-balance success email: tryClaimSend + Brevo + logNotificationSent + retry queue on failure.
 */

import type { Firestore } from "firebase-admin/firestore";
import { getSlotStartEnd, parseSlotId } from "@/lib/booking/experience-slots";
import { formatMoney } from "@/lib/booking/format-money";
import { logNotificationSent } from "@/lib/booking/email-log";
import { tryClaimSend, markClaimSent, markClaimFailed } from "@/lib/booking/notification-claim";
import { addToRetryQueue } from "@/lib/booking/reminder-retry";
import { sendFinalChargeSuccessEmail } from "@/lib/booking/brevo";
import { isDepositMode } from "@/lib/booking/deposit-mode";
import type { Booking } from "@/lib/booking/types";
import type { Experience } from "@/lib/booking/types";

const TEMPLATE_KEY = "final_charge_success";

/** Returns true on success or duplicate skip (caller may clear retry queue). */
export async function notifyFinalChargeSuccess(db: Firestore, bookingId: string, booking: Booking): Promise<boolean> {
  if (!isDepositMode(booking)) return true;

  const claimed = await tryClaimSend(db, bookingId, TEMPLATE_KEY);
  if (!claimed) return true;

  const toEmail = booking.customer?.email?.trim();
  const customerName = booking.customer?.name?.trim() ?? "Guest";
  if (!toEmail) {
    await markClaimFailed(db, bookingId, TEMPLATE_KEY, "No customer email");
    return false;
  }

  const finalCents = booking.stripe?.finalAmountCents ?? 0;
  let tripDateStr = "";
  let startTimeStr = "";
  const slotId = booking.slotId;
  if (slotId) {
    const parsed = parseSlotId(slotId.trim());
    if (parsed) {
      const tripStart = getSlotStartEnd(
        parsed.dateStr,
        parsed.startHour,
        parsed.durationHours ?? 2,
        parsed.startMinute ?? 0
      ).start;
      tripDateStr = tripStart.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "America/Chicago",
      });
      startTimeStr = tripStart.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Chicago",
      });
    }
  }
  if (!tripDateStr && booking.startDateStr) {
    tripDateStr = booking.startDateStr;
  }

  let experienceName = "Your trip";
  if (booking.experienceId) {
    const expSnap = await db.collection("experiences").doc(booking.experienceId).get();
    if (expSnap.exists) {
      experienceName = (expSnap.data() as Experience).title ?? experienceName;
    }
  }

  const subject = `Payment received — ${experienceName} – Boat Bros ATX`;

  try {
    await sendFinalChargeSuccessEmail({
      to: toEmail,
      customerName,
      experienceName,
      tripDate: tripDateStr || "—",
      startTime: startTimeStr || "—",
      amountFormatted: formatMoney(finalCents),
    });
    await logNotificationSent({
      channel: "email",
      to: toEmail,
      toName: customerName,
      templateId: "final_charge_success",
      subject,
      bookingId,
      eventSubtype: "final_charge_success",
    });
    await markClaimSent(db, bookingId, TEMPLATE_KEY);
    return true;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await markClaimFailed(db, bookingId, TEMPLATE_KEY, errMsg);
    await addToRetryQueue(db, bookingId, "final_charge_success", errMsg);
    return false;
  }
}
