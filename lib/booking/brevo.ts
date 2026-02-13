/**
 * Brevo (Sendinblue) — transactional email and contact upsert.
 * Server-side only. Uses BREVO_API_KEY.
 */

import { bookingEnv } from "./env";
import { DEFAULT_CANCELLATION_POLICY } from "./cancellation-policy";
import { renderBookingConfirmationHtml } from "./email-templates";
import type { Booking } from "./types";

const BREVO_API_BASE = "https://api.brevo.com/v3";

function getHeaders(): Record<string, string> {
  return {
    "api-key": bookingEnv.brevoApiKey,
    "Content-Type": "application/json",
  };
}

export interface BookingEmailContext {
  boatName: string;
  startAt: string;
  endAt: string;
  durationHours: number;
  locationText: string;
  cancellationPolicyText: string;
  /** True when 50% deposit was paid; remaining charged at T-48h. */
  isDeposit?: boolean;
  /** Signed manage-booking URL (deposit flow) or receipt URL. */
  manageLink?: string;
}

const BOOKING_CONFIRMATION_SUBJECT = "Booking Confirmation – Boat Bros ATX";

function getSender(): { name: string; email: string } {
  const email = process.env.BREVO_SENDER_EMAIL?.trim() || "noreply@boatbrosatx.com";
  const name = process.env.BREVO_SENDER_NAME?.trim() || "Boat Bros ATX";
  return { name, email };
}

/**
 * Send booking confirmation email to the customer email from the booking details form.
 * Uses transactional send endpoint. If BREVO_BOOKING_TEMPLATE_ID is set, use template; else send HTML from email-templates.
 * Pass context for formatted date/time and boat/location/cancellation text.
 */
export async function sendBookingConfirmationEmail(booking: Booking, context: BookingEmailContext): Promise<void> {
  const toEmail = booking.customer?.email?.trim();
  if (!toEmail) {
    throw new Error("Booking customer email is required to send confirmation");
  }
  const html = renderBookingConfirmationHtml(booking, context);

  const templateId = bookingEnv.brevoBookingTemplateId;
  const { boatName, startAt, endAt, durationHours, locationText, cancellationPolicyText, isDeposit, manageLink } = context;
  const duration = `${durationHours} hour${durationHours !== 1 ? "s" : ""}`;
  const addonsSummary =
    booking.addonSelections.length > 0
      ? booking.addonSelections.map((s) => `${s.addonId}: qty ${s.qty}`).join(", ")
      : "None";
  const totalPaid = (booking.pricing.totalCents / 100).toFixed(2);
  const cancellationPolicy = cancellationPolicyText || DEFAULT_CANCELLATION_POLICY;
  const manageUrl = manageLink ?? `${bookingEnv.appBaseUrl}/booking`;

  const toName = booking.customer?.name?.trim() ?? "";
  const payload: Record<string, unknown> = templateId
    ? {
        templateId,
        to: [{ email: toEmail, name: toName }],
        params: {
          customerName: booking.customer.name,
          boatName,
          startAt,
          endAt,
          duration,
          addonsSummary,
          totalPaid,
          cancellationPolicy,
          locationText,
          manageUrl,
          isDeposit: isDeposit ?? false,
        },
      }
    : {
        sender: getSender(),
        to: [{ email: toEmail, name: toName }],
        subject: BOOKING_CONFIRMATION_SUBJECT,
        htmlContent: html,
      };

  const url = templateId ? `${BREVO_API_BASE}/smtp/email` : `${BREVO_API_BASE}/smtp/email`;
  const body = templateId
    ? { templateId, to: payload.to, params: payload.params }
    : { sender: payload.sender, to: payload.to, subject: payload.subject, htmlContent: payload.htmlContent };

  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    const errMsg = `Brevo send failed: ${res.status} ${text}`;
    console.error("[brevo] sendBookingConfirmationEmail", errMsg);
    throw new Error(errMsg);
  }
}

/**
 * Send "final charge failed" or "action required" email with manage-booking link.
 */
export async function sendFinalChargeFailedEmail(
  toEmail: string,
  toName: string,
  manageLink: string | undefined,
  requiresAction: boolean
): Promise<void> {
  const subject = requiresAction
    ? "Action needed to complete your booking – Boat Bros ATX"
    : "Payment failed for your upcoming trip – Boat Bros ATX";
  const body = requiresAction
    ? "Your card requires verification to complete the remaining balance. Please use the link below to update your card or complete payment."
    : "We couldn't charge the remaining balance for your upcoming trip. Please use the link below to update your card or pay the remaining balance.";
  const cta = manageLink
    ? `<a href="${manageLink.replace(/"/g, "&quot;")}" target="_blank" rel="noopener" style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; background: #50bdba; border-radius: 10px;">Complete payment</a>`
    : "";
  const html = `
<!DOCTYPE html>
<html><body style="font-family: sans-serif; padding: 24px;">
  <p>Hi ${toName.replace(/</g, "&lt;")},</p>
  <p>${body.replace(/</g, "&lt;")}</p>
  ${cta ? `<p style="margin-top: 24px;">${cta}</p>` : ""}
  <p style="margin-top: 24px; font-size: 12px; color: #666;">— Boat Bros ATX</p>
</body></html>`;
  const res = await fetch(`${BREVO_API_BASE}/smtp/email`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      sender: getSender(),
      to: [{ email: toEmail.trim(), name: toName.trim() || undefined }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[brevo] sendFinalChargeFailedEmail", res.status, text);
    throw new Error(`Brevo send failed: ${res.status}`);
  }
}

/**
 * Add or update contact in Brevo and optionally add to list (marketing opt-in).
 */
export async function upsertBrevoContact(
  email: string,
  name: string,
  phone: string,
  listId?: number
): Promise<void> {
  const listIds = listId != null ? [listId] : [];
  const res = await fetch(`${BREVO_API_BASE}/contacts`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      email,
      attributes: { FIRSTNAME: name.split(" ")[0] ?? name, LASTNAME: name.split(" ").slice(1).join(" ") || "", SMS: phone },
      listIds,
      updateEnabled: true,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo contact upsert failed: ${res.status} ${text}`);
  }
}
