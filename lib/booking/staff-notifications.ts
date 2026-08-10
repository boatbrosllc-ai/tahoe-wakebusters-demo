/**
 * Captain/staff notification contract: internal email (and optional SMS) for booking lifecycle
 * events parallel to guest-facing sends. Delivery is best-effort; failures are logged with state.
 */

import { logNotificationSent } from "@/lib/booking/email-log";
import { getStaffOperationsEmail, sendStaffInternalEmail } from "@/lib/booking/brevo";
import { sendStaffEventSms } from "@/lib/booking/sms";
import type { Booking } from "@/lib/booking/types";

export type StaffReminderKind = "1week" | "24h" | "dayof";

function esc(s: string): string {
  return s.replace(/</g, "&lt;");
}

async function logStaffEmailOk(params: {
  subject: string;
  bookingId: string;
  templateId: "staff_booking_confirmation" | "staff_reminder" | "staff_final_payment_request" | "staff_final_charge_success";
}): Promise<void> {
  await logNotificationSent({
    channel: "email",
    to: getStaffOperationsEmail(),
    templateId: params.templateId,
    subject: params.subject,
    bookingId: params.bookingId,
    eventSubtype: params.templateId,
    audience: "staff",
    deliveryState: "sent",
  }).catch((err) => console.error("[staff-notifications] logNotificationSent failed", err));
}

async function logStaffEmailFailed(
  templateId: "staff_booking_confirmation" | "staff_reminder" | "staff_final_payment_request" | "staff_final_charge_success",
  bookingId: string,
  err: unknown
): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  await logNotificationSent({
    channel: "email",
    to: getStaffOperationsEmail(),
    templateId,
    subject: `Failed: ${templateId}`,
    bookingId,
    eventSubtype: templateId,
    audience: "staff",
    deliveryState: "failed",
    bodySnippet: msg.slice(0, 500),
  }).catch((e) => console.error("[staff-notifications] logStaffEmailFailed log failed", e));
}

/** New paid booking — staff summary (runs after guest confirmation send succeeds). */
export async function notifyStaffBookingConfirmation(params: {
  bookingId: string;
  booking: Booking;
  boatName: string;
  startAt: string;
  endAt: string;
  /** When set (e.g. per-reschedule dispatch), must match customer/business confirmation idempotency namespace. */
  staffConfirmationIdempotencyKey?: string;
}): Promise<void> {
  const { bookingId, booking, boatName, startAt, endAt, staffConfirmationIdempotencyKey } = params;
  const cust = booking.customer;
  const subject = `[New booking] ${esc(boatName)} — ${esc(startAt)}`;
  const html = `
<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 16px; max-width: 560px;">
  <p><strong>New booking</strong> — ${esc(bookingId)}</p>
  <p><strong>Guest:</strong> ${esc(cust?.name ?? "—")} &lt;${esc(cust?.email ?? "—")}&gt;<br/>
  <strong>Phone:</strong> ${esc(cust?.phone?.trim() ?? "—")}</p>
  <p><strong>Trip:</strong> ${esc(boatName)}<br/>
  ${esc(startAt)} – ${esc(endAt)}</p>
  <p style="font-size: 12px; color: #666;">— Nasty Sport Fishing ops (automated)</p>
</body></html>`;
  await sendStaffInternalEmail({
    subject,
    htmlContent: html,
    idempotencyKey: staffConfirmationIdempotencyKey ?? `${bookingId}_staff_booking_confirmation`,
  });
  await logStaffEmailOk({
    subject,
    bookingId,
    templateId: "staff_booking_confirmation",
  });
  await sendStaffEventSms({
    bookingId,
    body: `New booking ${bookingId.slice(0, 8)}… ${boatName} ${startAt}`,
    templateId: "staff_booking_confirmation",
  });
}

/** Final balance paid (deposit flow) — staff receipt heads-up. */
export async function notifyStaffFinalChargeSuccess(params: {
  bookingId: string;
  experienceName: string;
  tripDate: string;
  startTime: string;
  amountFormatted: string;
  customerName: string;
  customerEmail: string;
}): Promise<void> {
  const subject = `[Payment received] ${esc(params.experienceName)} — ${esc(params.bookingId)}`;
  const html = `
<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 16px;">
  <p><strong>Final balance charged</strong> — booking ${esc(params.bookingId)}</p>
  <p><strong>Guest:</strong> ${esc(params.customerName)} &lt;${esc(params.customerEmail)}&gt;</p>
  <p><strong>Amount:</strong> ${esc(params.amountFormatted)}<br/>
  <strong>Trip:</strong> ${esc(params.experienceName)} — ${esc(params.tripDate)} ${esc(params.startTime)}</p>
</body></html>`;
  await sendStaffInternalEmail({
    subject,
    htmlContent: html,
    idempotencyKey: `${params.bookingId}_staff_final_charge_success`,
  });
  await logStaffEmailOk({
    subject,
    bookingId: params.bookingId,
    templateId: "staff_final_charge_success",
  });
  await sendStaffEventSms({
    bookingId: params.bookingId,
    body: `Final payment ${params.amountFormatted} — ${params.experienceName} (${params.bookingId.slice(0, 8)}…)`,
    templateId: "staff_final_charge_success",
  });
}

/** Reminder sent to guest — staff visibility. */
export async function notifyStaffReminderSent(params: {
  bookingId: string;
  kind: StaffReminderKind;
  experienceName: string;
  tripDate: string;
  customerName: string;
  customerEmail?: string;
}): Promise<void> {
  const label = params.kind === "1week" ? "1 week" : params.kind === "24h" ? "24h" : "day-of";
  const subject = `[Reminder ${label}] ${esc(params.experienceName)} — ${esc(params.bookingId)}`;
  const guestEmail = params.customerEmail?.trim() ? params.customerEmail.trim() : "—";
  const html = `
<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 16px;">
  <p><strong>Guest reminder sent (${label})</strong> — ${esc(params.bookingId)}</p>
  <p><strong>Guest:</strong> ${esc(params.customerName)} &lt;${esc(guestEmail)}&gt;<br/>
  <strong>Trip:</strong> ${esc(params.experienceName)} — ${esc(params.tripDate)}</p>
</body></html>`;
  try {
    await sendStaffInternalEmail({
      subject,
      htmlContent: html,
      idempotencyKey: `${params.bookingId}_staff_reminder_${params.kind}`,
    });
    await logStaffEmailOk({
      subject,
      bookingId: params.bookingId,
      templateId: "staff_reminder",
    });
  } catch (err) {
    await logStaffEmailFailed("staff_reminder", params.bookingId, err);
  }
  await sendStaffEventSms({
    bookingId: params.bookingId,
    body: `Reminder ${label} sent — ${params.experienceName} (${params.bookingId.slice(0, 8)}…)`,
    templateId: "staff_reminder",
  });
}

/** Final payment request email sent to guest — staff visibility. */
export async function notifyStaffFinalPaymentRequestSent(params: {
  bookingId: string;
  experienceName: string;
  tripDate: string;
  amountFormatted: string;
  customerName: string;
}): Promise<void> {
  const subject = `[Pay link sent] ${esc(params.experienceName)} — ${esc(params.bookingId)}`;
  const html = `
<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 16px;">
  <p><strong>Final payment request sent to guest</strong> — ${esc(params.bookingId)}</p>
  <p><strong>Guest:</strong> ${esc(params.customerName)}<br/>
  <strong>Amount due:</strong> ${esc(params.amountFormatted)}<br/>
  <strong>Trip:</strong> ${esc(params.experienceName)} — ${esc(params.tripDate)}</p>
</body></html>`;
  try {
    await sendStaffInternalEmail({
      subject,
      htmlContent: html,
      idempotencyKey: `${params.bookingId}_staff_final_payment_request`,
    });
    await logStaffEmailOk({
      subject,
      bookingId: params.bookingId,
      templateId: "staff_final_payment_request",
    });
  } catch (err) {
    await logStaffEmailFailed("staff_final_payment_request", params.bookingId, err);
  }
  await sendStaffEventSms({
    bookingId: params.bookingId,
    body: `Pay request ${params.amountFormatted} — ${params.experienceName}`,
    templateId: "staff_final_payment_request",
  });
}
