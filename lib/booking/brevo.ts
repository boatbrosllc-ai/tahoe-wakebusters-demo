/**
 * Brevo (Sendinblue) — transactional email and contact upsert.
 * Server-side only. Uses BREVO_API_KEY.
 */

import { bookingEnv } from "./env";
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
}

const BOOKING_CONFIRMATION_SUBJECT = "Booking Confirmation – Boat Bros ATX";

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
  const { boatName, startAt, endAt, durationHours, locationText, cancellationPolicyText } = context;
  const duration = `${durationHours} hour${durationHours !== 1 ? "s" : ""}`;
  const addonsSummary =
    booking.addonSelections.length > 0
      ? booking.addonSelections.map((s) => `${s.addonId}: qty ${s.qty}`).join(", ")
      : "None";
  const totalPaid = (booking.pricing.totalCents / 100).toFixed(2);
  const cancellationPolicy = cancellationPolicyText || "Cancel 24h before for full refund. See terms for details.";

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
          manageUrl: `${bookingEnv.appBaseUrl}/booking`,
        },
      }
    : {
        sender: { name: "Boat Bros ATX", email: "noreply@boatbrosatx.com" },
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
    throw new Error(`Brevo send failed: ${res.status} ${text}`);
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
