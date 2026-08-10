/**
 * Email templates for transactional emails (Brevo).
 * Used for sending and for admin HTML preview with sample data.
 */

import { brand } from "@/content/brand";
import { bookingEnv } from "./env";
import { DEFAULT_CANCELLATION_POLICY } from "./cancellation-policy";
import { formatMoney } from "./format-money";
import type { Booking, BookingStripe } from "./types";
import type { BookingEmailContext } from "./brevo";
import { isDepositMode } from "./deposit-mode";
import { DEPOSIT_FRACTION } from "./constants";

/** @deprecated Use isDepositMode from deposit-mode.ts. Kept for Brevo template params. */
export function isDepositFromBookingStripe(booking: Booking): boolean {
  return isDepositMode(booking);
}

/** Absolute URL for the Nasty Sport Fishing email logo (used in all transactional emails). */
function getEmailLogoUrl(): string {
  const base = bookingEnv.appBaseUrl.replace(/\/$/, "");
  return `${base}${brand.logoEmailPath}`;
}

import {
  buildReminder1WeekHtml,
  buildReminder24hHtml,
  buildReminderDayOfHtml,
  getReminderSubject,
} from "./reminder-emails";

export type EmailTemplateId =
  | "booking_confirmation"
  | "booking_reminder_1week"
  | "booking_reminder_24h"
  | "booking_reminder_dayof"
  | "final_payment_request"
  | "final_charge_success";

export interface EmailTemplateMeta {
  id: EmailTemplateId;
  name: string;
  description: string;
  subject: string;
}

const REMINDER_SAMPLE_PARAMS = {
  to: "guest@example.com",
  customerName: "Jordan",
  experienceName: "Nasty Half Day",
  tripDate: "Sat, Mar 22, 2025",
  startTime: "7:00 AM",
  locationText: "We'll send exact marina meet-up before your trip.",
  locationAddress: "Marina Cabo San Lucas, BCS",
  waiverSigningUrl: null as string | null,
  whatToBring: ["Sunscreen", "Hat", "Soft-soled shoes", "Valid ID"],
};

export const EMAIL_TEMPLATES: EmailTemplateMeta[] = [
  {
    id: "booking_confirmation",
    name: "Confirmation and Waiver",
    description:
      "One email with booking details and waiver link. Sent when a booking is paid. The live subject appends \"& Waiver\" when a waiver signing URL is available.",
    subject: "Booking Confirmation – Nasty Sport Fishing",
  },
  {
    id: "booking_reminder_1week",
    name: "1 week before trip",
    description: "Sent ~7 days before the trip. Includes waiver link if not yet signed.",
    subject: getReminderSubject("1week", REMINDER_SAMPLE_PARAMS.experienceName),
  },
  {
    id: "booking_reminder_24h",
    name: "24 hours before",
    description: "Sent the day before the trip. Marina meet-up reminders and trip logistics.",
    subject: getReminderSubject("24h", REMINDER_SAMPLE_PARAMS.experienceName),
  },
  {
    id: "booking_reminder_dayof",
    name: "Day of (3 hours before)",
    description: "Sent 3 hours before start. Same logistics; waiver link if still unsigned.",
    subject: getReminderSubject("dayof", REMINDER_SAMPLE_PARAMS.experienceName),
  },
];

const PRIMARY_COLOR = "#14b6dc";
const DARK_COLOR = "#04244a";
const ORANGE_COLOR = "#f27a0a";
const MUTED_COLOR = "#1a5a7a";
const BG_LIGHT = "#e8f6fa";

/** Header gradient: navy → teal → orange. */
const HEADER_GRADIENT = `linear-gradient(135deg, ${DARK_COLOR} 0%, ${PRIMARY_COLOR} 50%, ${ORANGE_COLOR} 100%)`;

/**
 * Render booking confirmation HTML (beautiful, email-client safe).
 * No manage-booking link (manage flow not offered).
 */
export function renderBookingConfirmationHtml(booking: Booking, context: BookingEmailContext): string {
  const { boatName, startAt, endAt, durationHours, locationText, cancellationPolicyText, finalChargeAt, waiverSigningUrl, waiverGroupSigningUrl, pricingType, addonsSummary: addonsSummaryFromContext, remainingAlreadyCharged } = context;
  const isTicketed = pricingType === "ticketed";
  const duration = `${durationHours} hour${durationHours !== 1 ? "s" : ""}`;
  const ticketCount = booking.partySize ?? 1;
  const addonsSummary =
    addonsSummaryFromContext !== undefined
      ? addonsSummaryFromContext
      : booking.addonSelections.length > 0
        ? booking.addonSelections.map((s) => `${s.addonId}: qty ${s.qty}`).join(", ")
        : "None";
  // Single source of truth: Stripe reflects actual charges; fallback to booking.pricing (all in cents).
  // Only render deposit-specific copy when we have a valid stripe.depositAmountCents (defensive guard).
  const stripe = booking.stripe as BookingStripe | undefined;
  const hasValidDepositAmount = typeof stripe?.depositAmountCents === "number" && stripe.depositAmountCents > 0;
  const isDepositFromContextOrBooking = context.isDeposit === true || isDepositMode(booking);
  if (isDepositFromContextOrBooking && !hasValidDepositAmount) {
    console.warn("[email-templates] deposit mode indicated but depositAmountCents missing or zero; using full-payment copy", { bookingId: (booking as { id?: string }).id });
  }
  const isDeposit = isDepositFromContextOrBooking && hasValidDepositAmount;
  const depositPaidCents = hasValidDepositAmount ? (stripe!.depositAmountCents as number) : booking.pricing.totalCents;
  const remainingCents =
    stripe?.finalAmountCents != null
      ? stripe.finalAmountCents
      : Math.max(0, booking.pricing.totalCents - depositPaidCents);
  const totalAmountCents = stripe?.totalAmountCents ?? booking.pricing.totalCents;
  const depositPaidFormatted = formatMoney(depositPaidCents);
  const remainingFormatted = formatMoney(remainingCents);
  const totalFormatted = formatMoney(totalAmountCents);
  const finalChargeAtFormatted =
    finalChargeAt && !Number.isNaN(new Date(finalChargeAt).getTime())
      ? new Date(finalChargeAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : null;
  const cancellationPolicy = cancellationPolicyText || DEFAULT_CANCELLATION_POLICY;
  const depositPct = Math.round(DEPOSIT_FRACTION * 100);
  const depositPctLabel = `${depositPct}%`;
  /** Short line for deposit flow: distinguish "remaining will be charged" vs "remaining was already charged" (e.g. resend for final_paid). */
  const depositCopy = isDeposit
    ? context.remainingAlreadyCharged
      ? `You paid a ${depositPctLabel} deposit (${depositPaidFormatted}). The remaining balance (${remainingFormatted}) was already charged. Your booking is fully paid.`
      : `You paid a ${depositPctLabel} deposit today (${depositPaidFormatted}). The remaining balance (${remainingFormatted}) will be charged automatically 48 hours before your trip${finalChargeAtFormatted ? ` on ${finalChargeAtFormatted}` : ""}.`
    : "";

  const remainingBalanceLabel = context.remainingAlreadyCharged
    ? "Remaining balance (already charged)"
    : `Remaining balance (auto-charged ${finalChargeAtFormatted ? escapeHtml(finalChargeAtFormatted) : "48 hours before your trip"})`;
  const paymentRows = isDeposit
    ? `
                      <tr><td style="padding: 6px 0; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">Deposit paid today (${depositPctLabel})</strong></td><td style="padding: 6px 0; font-size: 14px; color: ${DARK_COLOR}; text-align: right;">${depositPaidFormatted}</td></tr>
                      <tr><td style="padding: 6px 0; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">${remainingBalanceLabel}</strong></td><td style="padding: 6px 0; font-size: 14px; color: ${DARK_COLOR}; text-align: right;">${remainingFormatted}</td></tr>
                      <tr><td style="padding: 12px 0 6px; font-size: 14px; font-weight: 600; color: ${DARK_COLOR};">Total booking value</td><td style="padding: 12px 0 6px; font-size: 18px; font-weight: 700; color: ${PRIMARY_COLOR}; text-align: right;">${totalFormatted}</td></tr>`
    : `
                      <tr><td style="padding: 12px 0 6px; font-size: 14px; font-weight: 600; color: ${DARK_COLOR};">Total paid (full payment)</td><td style="padding: 12px 0 6px; font-size: 18px; font-weight: 700; color: ${PRIMARY_COLOR}; text-align: right;">${totalFormatted}</td></tr>`;

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
            <td style="background: ${HEADER_GRADIENT}; padding: 28px 32px; text-align: center;">
              <img src="${getEmailLogoUrl()}" alt="Nasty Sport Fishing" width="260" height="72" style="max-width: 260px; height: auto; display: block; margin: 0 auto;" />
              <p style="margin: 6px 0 0; font-size: 14px; color: rgba(255,255,255,0.9);">${isDeposit ? "Booking confirmed (deposit received)" : "Booking confirmed (full payment)"}</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: ${DARK_COLOR}; line-height: 1.5;">Hi ${escapeHtml(booking.customer.name)},</p>
              <p style="margin: 0 0 24px; font-size: 15px; color: ${MUTED_COLOR}; line-height: 1.6;">Your ${isTicketed ? "tickets are" : "reservation is"} confirmed. Here are the details:</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: ${BG_LIGHT}; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px 24px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr><td style="padding: 6px 0; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">${isTicketed ? "Experience" : "Experience / Boat"}</strong></td><td style="padding: 6px 0; font-size: 14px; color: ${DARK_COLOR}; text-align: right;">${escapeHtml(boatName)}</td></tr>
                      ${isTicketed ? `<tr><td style="padding: 6px 0; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">Tickets</strong></td><td style="padding: 6px 0; font-size: 14px; font-weight: 700; color: ${DARK_COLOR}; text-align: right;">${ticketCount} ticket${ticketCount !== 1 ? "s" : ""}</td></tr>` : ""}
                      <tr><td style="padding: 6px 0; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">${isTicketed ? "Departure" : "Date & time"}</strong></td><td style="padding: 6px 0; font-size: 14px; color: ${DARK_COLOR}; text-align: right;">${isTicketed ? escapeHtml(startAt) : `${escapeHtml(startAt)} – ${escapeHtml(endAt)}`}</td></tr>
                      ${!isTicketed ? `<tr><td style="padding: 6px 0; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">Duration</strong></td><td style="padding: 6px 0; font-size: 14px; color: ${DARK_COLOR}; text-align: right;">${duration}</td></tr>` : ""}
                      <tr><td style="padding: 6px 0; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">Add-ons</strong></td><td style="padding: 6px 0; font-size: 14px; color: ${DARK_COLOR}; text-align: right;">${escapeHtml(addonsSummary)}</td></tr>
                      ${paymentRows}
                    </table>
                  </td>
                </tr>
              </table>

              ${depositCopy ? `<p style="margin: 0 0 16px; font-size: 14px; color: ${MUTED_COLOR}; line-height: 1.5;">${escapeHtml(depositCopy)}</p>` : ""}
              <p style="margin: 0 0 8px; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">Cancellation:</strong> ${escapeHtml(cancellationPolicy)}</p>
              <p style="margin: 0 0 24px; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">Location / meeting:</strong> ${escapeHtml(locationText)}</p>

              ${waiverSigningUrl ? `
              <p style="margin: 24px 0 0; font-size: 14px; color: ${MUTED_COLOR}; line-height: 1.5;">Please sign your waiver before your trip:</p>
              <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin-top: 12px;">
                <tr>
                  <td style="border-radius: 10px; background: ${DARK_COLOR};">
                    <a href="${escapeHtml(waiverSigningUrl)}" target="_blank" rel="noopener" style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none;">Sign waiver</a>
                  </td>
                </tr>
              </table>
              ${waiverGroupSigningUrl ? `
              <p style="margin: 16px 0 0; font-size: 14px; color: ${MUTED_COLOR}; line-height: 1.5;">Share this link with everyone in your party so they can sign the waiver too:</p>
              <p style="margin: 8px 0 0; font-size: 13px; word-break: break-all;"><a href="${escapeHtml(waiverGroupSigningUrl)}" target="_blank" rel="noopener" style="color: ${PRIMARY_COLOR}; text-decoration: underline;">${escapeHtml(waiverGroupSigningUrl)}</a></p>
              ` : ""}
              ` : ""}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background: ${BG_LIGHT}; border-top: 1px solid rgba(0,28,48,0.08); text-align: center;">
              <p style="margin: 0; font-size: 12px; color: ${MUTED_COLOR};">— Nasty Sport Fishing</p>
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

/** Sample booking + context for admin HTML preview. Uses realistic cents (e.g. $320 total). */
export function getBookingConfirmationPreviewHtml(): string {
  const sampleBooking: Booking = {
    experienceId: "exp-sample",
    slotId: "slot-sample",
    rateId: "rate-sample",
    addonSelections: [{ addonId: "addon-cooler", qty: 1 }],
    partySize: 4,
    petsCount: 0,
    answers: {},
    customer: { name: "Jordan Smith", email: "jordan@example.com", phone: "(512) 957-6197" },
    pricing: { subtotalCents: 29500, taxCents: 2500, feesCents: 0, totalCents: 32000, currency: "usd" },
    status: "paid",
    stripe: { paymentIntentId: "pi_preview", totalAmountCents: 32000 },
    createdAt: { toDate: () => new Date() } as any,
  };
  const sampleContext: BookingEmailContext = {
    boatName: "Sunset Cruise – Lake Austin",
    startAt: "Sat, Mar 15, 2025, 2:00 PM",
    endAt: "Sat, Mar 15, 2025, 4:00 PM",
    durationHours: 2,
    locationText: "We'll send exact meeting point after booking.",
    cancellationPolicyText: DEFAULT_CANCELLATION_POLICY,
    addonsSummary: "Cooler: qty 1",
  };
  return renderBookingConfirmationHtml(sampleBooking, sampleContext);
}

export function getPreviewHtml(templateId: EmailTemplateId): string {
  switch (templateId) {
    case "booking_confirmation":
      return getBookingConfirmationPreviewHtml();
    case "booking_reminder_1week":
      return buildReminder1WeekHtml(REMINDER_SAMPLE_PARAMS);
    case "booking_reminder_24h":
      return buildReminder24hHtml(REMINDER_SAMPLE_PARAMS);
    case "booking_reminder_dayof":
      return buildReminderDayOfHtml(REMINDER_SAMPLE_PARAMS);
    default:
      return "<p>Preview not available.</p>";
  }
}
