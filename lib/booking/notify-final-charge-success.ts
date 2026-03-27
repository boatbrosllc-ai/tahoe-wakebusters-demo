/**
 * Idempotent final-balance success email: tryClaimSend + Brevo + best-effort logs + retry queue on provider failure only.
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
import { notifyStaffFinalChargeSuccess } from "@/lib/booking/staff-notifications";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";

const TEMPLATE_KEY = "final_charge_success";

export type NotifyFinalChargeSuccessOptions = {
  /** When true, do not enqueue reminder-retry (e.g. notification outbox handles backoff). */
  skipReminderRetryQueue?: boolean;
};

export type NotifyFinalChargeSuccessResult =
  | { ok: true; providerMessageId?: string; duplicate?: boolean; suppressed?: boolean }
  | { ok: false };

/** Returns ok on success or duplicate skip (claim already sent). */
export async function notifyFinalChargeSuccess(
  db: Firestore,
  bookingId: string,
  booking: Booking,
  options?: NotifyFinalChargeSuccessOptions
): Promise<NotifyFinalChargeSuccessResult> {
  if (!isDepositMode(booking)) return { ok: true };

  if (booking.status !== "final_paid") {
    return { ok: true, suppressed: true };
  }

  const claimed = await tryClaimSend(db, bookingId, TEMPLATE_KEY);
  if (!claimed) return { ok: true, duplicate: true };

  const toEmail = booking.customer?.email?.trim();
  const customerName = booking.customer?.name?.trim() ?? "Guest";
  if (!toEmail) {
    await markClaimFailed(db, bookingId, TEMPLATE_KEY, "No customer email");
    return { ok: false };
  }

  const finalCents = booking.stripe?.finalAmountCents ?? 0;
  let tripDateStr = "";
  let startTimeStr = "";
  const slotId = booking.slotId;
  if (slotId) {
    const parsed = parseSlotId(slotId.trim());
    if (parsed) {
      /** `tripStart` is a UTC instant from `getSlotStartEnd`; email lines below format it in America/Chicago. */
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
    const { providerMessageId } = await sendFinalChargeSuccessEmail(
      {
        to: toEmail,
        customerName,
        experienceName,
        tripDate: tripDateStr || "—",
        startTime: startTimeStr || "—",
        amountFormatted: formatMoney(finalCents),
      },
      { idempotencyKey: `${bookingId}_final_charge_success` }
    );

    await markClaimSent(db, bookingId, TEMPLATE_KEY, { providerMessageId });

    void logNotificationSent({
      channel: "email",
      to: toEmail,
      toName: customerName,
      templateId: "final_charge_success",
      subject,
      bookingId,
      eventSubtype: "final_charge_success",
    }).catch((e) => console.error("[notifyFinalChargeSuccess] logNotificationSent", e));

    try {
      await notifyStaffFinalChargeSuccess({
        bookingId,
        experienceName,
        tripDate: tripDateStr || "—",
        startTime: startTimeStr || "—",
        amountFormatted: formatMoney(finalCents),
        customerName,
        customerEmail: toEmail,
      });
    } catch (staffErr) {
      const msg = staffErr instanceof Error ? staffErr.message : String(staffErr);
      await writeOperationalAlert({
        type: "staff_notification_failed",
        bookingId,
        templateId: "staff_final_charge_success",
        lastError: msg,
        source: "notify-final-charge-success",
      });
    }

    return { ok: true, providerMessageId };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await markClaimFailed(db, bookingId, TEMPLATE_KEY, errMsg);
    if (!options?.skipReminderRetryQueue) {
      await addToRetryQueue(db, bookingId, "final_charge_success", errMsg);
    }
    return { ok: false };
  }
}
