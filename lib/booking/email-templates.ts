/**
 * Email templates for transactional emails (Brevo).
 * Used for sending and for admin HTML preview with sample data.
 */

import { bookingEnv } from "./env";
import type { Booking } from "./types";
import type { BookingEmailContext } from "./brevo";

export type EmailTemplateId = "booking_confirmation";

export interface EmailTemplateMeta {
  id: EmailTemplateId;
  name: string;
  description: string;
  subject: string;
}

export const EMAIL_TEMPLATES: EmailTemplateMeta[] = [
  {
    id: "booking_confirmation",
    name: "Booking confirmation",
    description: "Sent when a booking is paid (Stripe webhook).",
    subject: "Booking Confirmation – Boat Bros ATX",
  },
];

const PRIMARY_COLOR = "#50bdba";
const DARK_COLOR = "#001c30";
const MUTED_COLOR = "#196a87";
const BG_LIGHT = "#f0fafb";

/**
 * Build manage/booking URL (works for Checkout Session or Payment Intent).
 */
function bookingManageUrl(booking: { stripe: { checkoutSessionId?: string; paymentIntentId?: string } }): string {
  const sessionId = booking.stripe.checkoutSessionId;
  const pi = booking.stripe.paymentIntentId;
  if (sessionId) return `${bookingEnv.appBaseUrl}/booking/success?session_id=${sessionId}`;
  if (pi) return `${bookingEnv.appBaseUrl}/booking/success?payment_intent=${pi}`;
  return `${bookingEnv.appBaseUrl}/booking`;
}

/**
 * Render booking confirmation HTML (beautiful, email-client safe).
 */
export function renderBookingConfirmationHtml(booking: Booking, context: BookingEmailContext): string {
  const { boatName, startAt, endAt, durationHours, locationText, cancellationPolicyText } = context;
  const duration = `${durationHours} hour${durationHours !== 1 ? "s" : ""}`;
  const addonsSummary =
    booking.addonSelections.length > 0
      ? booking.addonSelections.map((s) => `${s.addonId}: qty ${s.qty}`).join(", ")
      : "None";
  const totalPaid = (booking.pricing.totalCents / 100).toFixed(2);
  const cancellationPolicy = cancellationPolicyText || "Cancel 24h before for full refund. See terms for details.";
  const manageUrl = bookingManageUrl(booking);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmation</title>
</head>
<body style="margin:0; padding:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: ${BG_LIGHT}; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${BG_LIGHT};">
    <tr>
      <td align="center" style="padding: 32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,28,48,0.08); overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${DARK_COLOR} 100%); padding: 28px 32px; text-align: center;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em;">Boat Bros ATX</h1>
              <p style="margin: 8px 0 0; font-size: 14px; color: rgba(255,255,255,0.9);">Booking confirmed</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: ${DARK_COLOR}; line-height: 1.5;">Hi ${escapeHtml(booking.customer.name)},</p>
              <p style="margin: 0 0 24px; font-size: 15px; color: ${MUTED_COLOR}; line-height: 1.6;">Your reservation is confirmed. Here are the details:</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: ${BG_LIGHT}; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px 24px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr><td style="padding: 6px 0; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">Experience / Boat</strong></td><td style="padding: 6px 0; font-size: 14px; color: ${DARK_COLOR}; text-align: right;">${escapeHtml(boatName)}</td></tr>
                      <tr><td style="padding: 6px 0; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">Date & time</strong></td><td style="padding: 6px 0; font-size: 14px; color: ${DARK_COLOR}; text-align: right;">${escapeHtml(startAt)} – ${escapeHtml(endAt)}</td></tr>
                      <tr><td style="padding: 6px 0; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">Duration</strong></td><td style="padding: 6px 0; font-size: 14px; color: ${DARK_COLOR}; text-align: right;">${duration}</td></tr>
                      <tr><td style="padding: 6px 0; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">Add-ons</strong></td><td style="padding: 6px 0; font-size: 14px; color: ${DARK_COLOR}; text-align: right;">${escapeHtml(addonsSummary)}</td></tr>
                      <tr><td style="padding: 12px 0 6px; font-size: 14px; font-weight: 600; color: ${DARK_COLOR};">Total paid</td><td style="padding: 12px 0 6px; font-size: 18px; font-weight: 700; color: ${PRIMARY_COLOR}; text-align: right;">$${totalPaid}</td></tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 8px; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">Cancellation:</strong> ${escapeHtml(cancellationPolicy)}</p>
              <p style="margin: 0 0 24px; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">Location / meeting:</strong> ${escapeHtml(locationText)}</p>

              <table role="presentation" cellspacing="0" cellpadding="0" align="center">
                <tr>
                  <td style="border-radius: 10px; background: ${PRIMARY_COLOR};">
                    <a href="${escapeHtml(manageUrl)}" target="_blank" rel="noopener" style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none;">View booking details</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background: ${BG_LIGHT}; border-top: 1px solid rgba(0,28,48,0.08); text-align: center;">
              <p style="margin: 0; font-size: 12px; color: ${MUTED_COLOR};">— Boat Bros ATX</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Sample booking + context for admin HTML preview. */
export function getBookingConfirmationPreviewHtml(): string {
  const sampleBooking: Booking = {
    experienceId: "exp-sample",
    slotId: "slot-sample",
    rateId: "rate-sample",
    addonSelections: [{ addonId: "addon-cooler", qty: 1 }],
    partySize: 4,
    petsCount: 0,
    answers: {},
    customer: { name: "Jordan Smith", email: "jordan@example.com", phone: "(512) 555-0123" },
    pricing: { subtotalCents: 29500, taxCents: 2500, feesCents: 0, totalCents: 32000, currency: "usd" },
    status: "paid",
    stripe: { paymentIntentId: "pi_preview" },
    createdAt: { toDate: () => new Date() } as any,
  };
  const sampleContext: BookingEmailContext = {
    boatName: "Sunset Cruise – Lake Travis",
    startAt: "Sat, Mar 15, 2025, 2:00 PM",
    endAt: "Sat, Mar 15, 2025, 4:00 PM",
    durationHours: 2,
    locationText: "We'll send exact meeting point after booking.",
    cancellationPolicyText: "Free cancel until 30 days before · 50% refund 15–30 days · No refund within 14 days.",
  };
  return renderBookingConfirmationHtml(sampleBooking, sampleContext);
}

export function getPreviewHtml(templateId: EmailTemplateId): string {
  switch (templateId) {
    case "booking_confirmation":
      return getBookingConfirmationPreviewHtml();
    default:
      return "<p>Preview not available.</p>";
  }
}
