/**
 * Email templates for transactional emails (Brevo).
 * Used for sending and for admin HTML preview with sample data.
 */

import { brand } from "@/content/brand";
import { fromOperatorNoteAuthorLabel, operatorNoteAuthorFirstName } from "@/lib/admin/operator-notes";
import { bookingEnv } from "./env";
import { EMAIL_HEAD_EXTRAS, renderEmailHeaderCell } from "./email-brand";
import { DEFAULT_CANCELLATION_POLICY } from "./cancellation-policy";
import { formatMoney } from "./format-money";
import type { Booking, BookingStripe } from "./types";
import type { BookingEmailContext } from "./brevo";
import { isDepositMode } from "./deposit-mode";
import { DEPOSIT_FRACTION } from "./constants";
import {
  formatBalanceLeadTimePhrase,
  getDepositPercentLabel,
} from "./booking-policy-copy";
import { shouldAutoChargeRemainingBalance } from "./customer-operations";
import { buildGoogleCalendarTemplateUrl } from "./google-calendar-url";
import {
  locationTextFromLogistics,
  renderEmailLogisticsHtml,
  type ExperienceEmailLogistics,
} from "./experience-email-logistics";

/** @deprecated Use isDepositMode from deposit-mode.ts. Kept for Brevo template params. */
export function isDepositFromBookingStripe(booking: Booking): boolean {
  return isDepositMode(booking);
}

/** Absolute URL for the ${brand.companyName} email logo (used in all transactional emails). */
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
  | "final_charge_success"
  | "captain_assignment"
  | "captain_unassigned"
  | "team_invite";

export interface EmailTemplateMeta {
  id: EmailTemplateId;
  name: string;
  description: string;
  subject: string;
}

const REMINDER_SAMPLE_LOGISTICS: ExperienceEmailLogistics = {
  pickupTitle: "Marina meet-up",
  pickupAddress: "Your City",
  arrivalInstructions: "Please arrive 10–15 minutes before your scheduled departure time.",
  whatToBring: ["Sunscreen", "Hat", "Soft-soled shoes", "Valid ID"],
  rulesText: "Glass and Styrofoam are not allowed on the lake.",
  gratuityText: "Captain gratuity is not included in the booking price and is always appreciated.",
};

const REMINDER_SAMPLE_PARAMS = {
  to: "guest@example.com",
  customerName: "Jordan",
  experienceName: "Half Day",
  tripDate: "Sat, Mar 22, 2025",
  startTime: "7:00 AM",
  locationText: locationTextFromLogistics(REMINDER_SAMPLE_LOGISTICS, "We'll send exact dock meet-up before your trip."),
  locationAddress: REMINDER_SAMPLE_LOGISTICS.pickupAddress,
  waiverSigningUrl: null as string | null,
  whatToBring: REMINDER_SAMPLE_LOGISTICS.whatToBring,
  logistics: REMINDER_SAMPLE_LOGISTICS,
};

export const EMAIL_TEMPLATES: EmailTemplateMeta[] = [
  {
    id: "booking_confirmation",
    name: "Confirmation and Waiver",
    description:
      "One email with booking details and waiver link. Sent when a booking is paid. The live subject appends \"& Waiver\" when a waiver signing URL is available.",
    subject: `Booking Confirmation – ${brand.companyName}`,
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
const EMAIL_CARD = `max-width: 560px; background: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(4,36,74,0.08);`;

/** Header gradient: navy → teal → orange. */
const HEADER_GRADIENT = `linear-gradient(135deg, ${DARK_COLOR} 0%, ${PRIMARY_COLOR} 50%, ${ORANGE_COLOR} 100%)`;

/**
 * Render booking confirmation HTML (beautiful, email-client safe).
 * No manage-booking link (manage flow not offered).
 */
export function renderBookingConfirmationHtml(booking: Booking, context: BookingEmailContext): string {
  const {
    boatName,
    startAt,
    endAt,
    durationHours,
    locationText,
    cancellationPolicyText,
    finalChargeAt,
    waiverSigningUrl,
    waiverGroupSigningUrl,
    pricingType,
    addonsSummary: addonsSummaryFromContext,
    remainingAlreadyCharged,
    logistics,
  } = context;
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
  const depositPctLabel = getDepositPercentLabel();
  const balanceLeadPhrase = formatBalanceLeadTimePhrase();
  /** Short line for deposit flow: distinguish "remaining will be charged" vs "remaining was already charged" (e.g. resend for final_paid). */
  const depositCopy = isDeposit
    ? context.remainingAlreadyCharged
      ? `You paid a ${depositPctLabel} deposit (${depositPaidFormatted}). The remaining balance (${remainingFormatted}) was already charged. Your booking is fully paid.`
      : shouldAutoChargeRemainingBalance()
        ? `You paid a ${depositPctLabel} deposit today (${depositPaidFormatted}). The remaining balance (${remainingFormatted}) will be charged automatically ${balanceLeadPhrase}${finalChargeAtFormatted ? ` on ${finalChargeAtFormatted}` : ""}.`
        : `You paid a ${depositPctLabel} deposit today (${depositPaidFormatted}). The remaining balance (${remainingFormatted}) is due on arrival.`
    : "";

  const remainingBalanceLabel = context.remainingAlreadyCharged
    ? "Remaining balance (already charged)"
    : shouldAutoChargeRemainingBalance()
      ? `Remaining balance (auto-charged ${finalChargeAtFormatted ? escapeHtml(finalChargeAtFormatted) : balanceLeadPhrase})`
      : "Remaining balance (due on arrival)";
  const paymentRows = isDeposit
    ? `
                      <tr><td style="padding: 6px 0; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">Deposit paid today (${depositPctLabel})</strong></td><td style="padding: 6px 0; font-size: 14px; color: ${DARK_COLOR}; text-align: right;">${depositPaidFormatted}</td></tr>
                      <tr><td style="padding: 6px 0; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">${remainingBalanceLabel}</strong></td><td style="padding: 6px 0; font-size: 14px; color: ${DARK_COLOR}; text-align: right;">${remainingFormatted}</td></tr>
                      <tr><td style="padding: 12px 0 6px; font-size: 14px; font-weight: 600; color: ${DARK_COLOR};">Total booking value</td><td style="padding: 12px 0 6px; font-size: 18px; font-weight: 700; color: ${PRIMARY_COLOR}; text-align: right;">${totalFormatted}</td></tr>`
    : `
                      <tr><td style="padding: 12px 0 6px; font-size: 14px; font-weight: 600; color: ${DARK_COLOR};">Total paid (full payment)</td><td style="padding: 12px 0 6px; font-size: 18px; font-weight: 700; color: ${PRIMARY_COLOR}; text-align: right;">${totalFormatted}</td></tr>`;

  const logisticsHtml = logistics
    ? renderEmailLogisticsHtml(logistics)
    : locationText.trim()
      ? renderEmailLogisticsHtml({ pickupAddress: locationText, whatToBring: [] })
      : "";

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
              <img src="${getEmailLogoUrl()}" alt="${brand.companyName}" width="260" height="72" style="max-width: 260px; height: auto; display: block; margin: 0 auto;" />
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
              ${logisticsHtml}

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
              <p style="margin: 0; font-size: 12px; color: ${MUTED_COLOR};">— ${brand.companyName}</p>
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
export type EmailPreviewOptions = {
  experienceTitle?: string;
  logistics?: ExperienceEmailLogistics;
};

export function getBookingConfirmationPreviewHtml(options?: EmailPreviewOptions): string {
  const logistics = options?.logistics ?? REMINDER_SAMPLE_LOGISTICS;
  const boatName = options?.experienceTitle?.trim() || "Private Charter";
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
    boatName,
    startAt: "Sat, Mar 15, 2025, 2:00 PM",
    endAt: "Sat, Mar 15, 2025, 4:00 PM",
    durationHours: 2,
    locationText: locationTextFromLogistics(logistics, "We'll send exact meeting point after booking."),
    cancellationPolicyText: DEFAULT_CANCELLATION_POLICY,
    logistics,
    addonsSummary: "Cooler: qty 1",
  };
  return renderBookingConfirmationHtml(sampleBooking, sampleContext);
}

export function getPreviewHtml(templateId: EmailTemplateId, options?: EmailPreviewOptions): string {
  const logistics = options?.logistics;
  const experienceName = options?.experienceTitle?.trim() || REMINDER_SAMPLE_PARAMS.experienceName;
  const reminderParams = {
    ...REMINDER_SAMPLE_PARAMS,
    experienceName,
    ...(logistics
      ? {
          locationText: locationTextFromLogistics(logistics, REMINDER_SAMPLE_PARAMS.locationText),
          locationAddress: logistics.pickupAddress,
          whatToBring: logistics.whatToBring,
          logistics,
        }
      : {}),
  };
  switch (templateId) {
    case "booking_confirmation":
      return getBookingConfirmationPreviewHtml(options);
    case "booking_reminder_1week":
      return buildReminder1WeekHtml(reminderParams);
    case "booking_reminder_24h":
      return buildReminder24hHtml(reminderParams);
    case "booking_reminder_dayof":
      return buildReminderDayOfHtml(reminderParams);
    case "captain_assignment":
      return renderCaptainAssignmentHtml(CAPTAIN_EMAIL_PREVIEW_PARAMS);
    case "captain_unassigned":
      return renderCaptainUnassignedHtml({ ...CAPTAIN_EMAIL_PREVIEW_PARAMS, kind: "unassigned" });
    case "team_invite":
      return renderTeamInviteHtml({
        toName: "Alex",
        roleLabel: "Captain",
        resetLink: "https://example.com/reset",
      });
    default:
      return "<p>Preview not available.</p>";
  }
}

export type CaptainTripEmailKind = "assigned" | "rescheduled" | "unassigned" | "cancelled" | "notes";

export type CaptainTripEmailParams = {
  captainName: string;
  experienceName: string;
  boatName: string;
  tripDate: string;
  startTime: string;
  endTime: string;
  guestName: string;
  guestPhone: string;
  partySize: number | null;
  locationText: string;
  specialNotes: string;
  /** Internal briefing from Admin or an operator. */
  operatorNotes?: string;
  assignedByName: string;
  kind?: CaptainTripEmailKind;
  /** ISO instants for Add to Google Calendar (America/Chicago wall time via ctz). */
  startAtIso?: string;
  endAtIso?: string;
};

const CAPTAIN_EMAIL_PREVIEW_PARAMS: CaptainTripEmailParams = {
  captainName: "Alex Rivera",
  experienceName: "Sample Charter",
  boatName: "The Bros Pontoon",
  tripDate: "Sat, Mar 22, 2025",
  startTime: "2:00 PM",
  endTime: "5:00 PM",
  guestName: "Jordan Smith",
  guestPhone: "(512) 957-6197",
  partySize: 8,
  locationText: "Loop 360 Boat Ramp — 5019 N Capital of Texas Hwy, Austin, TX 78746",
  specialNotes: "Birthday — bring Bluetooth speaker.",
  operatorNotes: "Dock on the north side. Guest is celebrating a 30th.",
  assignedByName: "Admin",
  kind: "assigned",
  startAtIso: "2025-03-22T19:00:00.000Z",
  endAtIso: "2025-03-22T22:00:00.000Z",
};

function captainNoteAuthorFirstName(params: Pick<CaptainTripEmailParams, "assignedByName">): string {
  return operatorNoteAuthorFirstName({ byName: params.assignedByName, by: params.assignedByName });
}

export function getCaptainAssignmentSubject(params: CaptainTripEmailParams): string {
  if (params.kind === "rescheduled") {
    return `Trip moved — ${params.tripDate} ${params.experienceName}`;
  }
  if (params.kind === "notes") {
    return `Note from ${captainNoteAuthorFirstName(params)} — ${params.tripDate} ${params.experienceName}`;
  }
  return `You’re assigned — ${params.tripDate} ${params.experienceName}`;
}

export function getCaptainUnassignedSubject(params: CaptainTripEmailParams): string {
  if (params.kind === "cancelled") {
    return `Trip canceled — ${params.tripDate} ${params.experienceName}`;
  }
  return `Trip update — you’re no longer on ${params.tripDate}`;
}

export function captainGoogleCalendarUrl(params: CaptainTripEmailParams): string | null {
  if (!params.startAtIso || !params.endAtIso) return null;
  const start = new Date(params.startAtIso);
  const end = new Date(params.endAtIso);
  const party =
    params.partySize != null && params.partySize > 0
      ? `${params.partySize} guest${params.partySize !== 1 ? "s" : ""}`
      : "";
  const details = [
    params.guestName && params.guestName !== "—" ? `Guest: ${params.guestName}` : "",
    params.guestPhone && params.guestPhone !== "—" ? `Phone: ${params.guestPhone}` : "",
    party ? `Party: ${party}` : "",
    params.boatName && params.boatName !== "—" ? `Boat: ${params.boatName}` : "",
    params.specialNotes.trim() ? `Guest requests: ${params.specialNotes.trim()}` : "",
    params.operatorNotes?.trim()
      ? `${fromOperatorNoteAuthorLabel({ byName: params.assignedByName })}: ${params.operatorNotes.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const title = params.experienceName.trim()
    ? `operator — ${params.experienceName.trim()}`
    : "operator trip";
  return buildGoogleCalendarTemplateUrl({
    title,
    start,
    end,
    details,
    location: params.locationText,
  });
}

function captainEmailShell(opts: { subtitle: string; greeting: string; intro: string; params: CaptainTripEmailParams; showGuest: boolean }): string {
  const p = opts.params;
  const party =
    p.partySize != null && p.partySize > 0
      ? `${p.partySize} guest${p.partySize !== 1 ? "s" : ""}`
      : "—";
  const guestRows = opts.showGuest
    ? `
                      <tr><td style="padding: 6px 0; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">Guest</strong></td><td style="padding: 6px 0; font-size: 14px; color: ${DARK_COLOR}; text-align: right;">${escapeHtml(p.guestName || "—")}</td></tr>
                      <tr><td style="padding: 6px 0; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">Phone</strong></td><td style="padding: 6px 0; font-size: 14px; color: ${DARK_COLOR}; text-align: right;">${escapeHtml(p.guestPhone || "—")}</td></tr>
                      <tr><td style="padding: 6px 0; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">Party</strong></td><td style="padding: 6px 0; font-size: 14px; color: ${DARK_COLOR}; text-align: right;">${escapeHtml(party)}</td></tr>`
    : "";
  const notesRow =
    opts.showGuest && p.specialNotes.trim()
      ? `<p style="margin: 0 0 16px; font-size: 14px; color: ${MUTED_COLOR}; line-height: 1.5;"><strong style="color: ${DARK_COLOR};">Guest requests:</strong> ${escapeHtml(p.specialNotes)}</p>`
      : "";
  const opsNotesRow =
    opts.showGuest && p.operatorNotes?.trim()
      ? `<p style="margin: 0 0 16px; font-size: 14px; color: ${MUTED_COLOR}; line-height: 1.5;"><strong style="color: ${DARK_COLOR};">${escapeHtml(fromOperatorNoteAuthorLabel({ byName: p.assignedByName }))}:</strong> ${escapeHtml(p.operatorNotes)}</p>`
      : "";
  const assignedBy =
    opts.showGuest && p.assignedByName.trim()
      ? `<p style="margin: 0 0 8px; font-size: 13px; color: ${MUTED_COLOR};">Assigned by ${escapeHtml(p.assignedByName)}.</p>`
      : "";
  const calendarUrl = opts.showGuest ? captainGoogleCalendarUrl(p) : null;
  const manageUrl = opts.showGuest ? getCaptainCalendarUrl() : null;
  const actionButtons =
    opts.showGuest && manageUrl
      ? `
              <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin: 20px auto 8px;">
                <tr>
                  ${
                    calendarUrl
                      ? `<td style="border-radius: 10px; background: ${DARK_COLOR};">
                    <a href="${escapeHtml(calendarUrl)}" target="_blank" rel="noopener" style="display: inline-block; padding: 14px 20px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none;">Add to Google Calendar</a>
                  </td>
                  <td width="12" style="width:12px;font-size:0;line-height:0;">&nbsp;</td>`
                      : ""
                  }
                  <td style="border-radius: 10px; background: ${PRIMARY_COLOR};">
                    <a href="${escapeHtml(manageUrl)}" target="_blank" rel="noopener" style="display: inline-block; padding: 14px 20px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none;">Manage in app</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 16px; font-size: 12px; color: ${MUTED_COLOR}; text-align: center;">${calendarUrl ? "Add this trip to Google Calendar, or open your operator calendar." : "Open your operator calendar in the app."}</p>`
      : "";
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${EMAIL_HEAD_EXTRAS}
  <title>${escapeHtml(opts.subtitle)}</title>
</head>
<body style="margin:0; padding:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: ${BG_LIGHT}; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${BG_LIGHT};">
    <tr>
      <td align="center" style="padding: 24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="${EMAIL_CARD}">
          <tr>
            ${renderEmailHeaderCell(escapeHtml(opts.subtitle))}
          </tr>
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: ${DARK_COLOR}; line-height: 1.5;">Hi ${escapeHtml(p.captainName || "there")},</p>
              <p style="margin: 0 0 24px; font-size: 15px; color: ${MUTED_COLOR}; line-height: 1.6;">${escapeHtml(opts.intro)}</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: ${BG_LIGHT}; border-radius: 12px; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px 24px;">
                    <p style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: ${DARK_COLOR};">Trip details</p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr><td style="padding: 6px 0; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">Trip</strong></td><td style="padding: 6px 0; font-size: 14px; color: ${DARK_COLOR}; text-align: right;">${escapeHtml(p.experienceName)}</td></tr>
                      <tr><td style="padding: 6px 0; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">Boat</strong></td><td style="padding: 6px 0; font-size: 14px; color: ${DARK_COLOR}; text-align: right;">${escapeHtml(p.boatName || "—")}</td></tr>
                      <tr><td style="padding: 6px 0; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">Date</strong></td><td style="padding: 6px 0; font-size: 14px; color: ${DARK_COLOR}; text-align: right;">${escapeHtml(p.tripDate)}</td></tr>
                      <tr><td style="padding: 6px 0; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">Time</strong></td><td style="padding: 6px 0; font-size: 14px; color: ${DARK_COLOR}; text-align: right;">${escapeHtml(p.startTime)}${p.endTime ? ` – ${escapeHtml(p.endTime)}` : ""}</td></tr>
                      ${guestRows}
                      ${p.locationText.trim() ? `<tr><td style="padding: 6px 0; font-size: 13px; color: ${MUTED_COLOR};"><strong style="color: ${DARK_COLOR};">Meet</strong></td><td style="padding: 6px 0; font-size: 14px; color: ${DARK_COLOR}; text-align: right;">${escapeHtml(p.locationText)}</td></tr>` : ""}
                    </table>
                  </td>
                </tr>
              </table>
              ${opsNotesRow}
              ${notesRow}
              ${assignedBy}
              ${actionButtons}
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px; background: ${BG_LIGHT}; border-top: 1px solid rgba(0,28,48,0.08); text-align: center;">
              <p style="margin: 0; font-size: 12px; color: ${MUTED_COLOR};">— ${escapeHtml(brand.companyName)}</p>
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

export function renderCaptainAssignmentHtml(params: CaptainTripEmailParams): string {
  const kind = params.kind === "rescheduled" ? "rescheduled" : params.kind === "notes" ? "notes" : "assigned";
  return captainEmailShell({
    subtitle: kind === "rescheduled" ? "Trip time changed" : kind === "notes" ? `Note from ${captainNoteAuthorFirstName(params)}` : "You’re on this trip",
    greeting: params.captainName,
    intro:
      kind === "rescheduled"
        ? "This trip was rescheduled. Here are the updated details:"
        : kind === "notes"
          ? `${captainNoteAuthorFirstName(params)} left a note on this trip:`
          : "You’ve been assigned to the following trip:",
    params: { ...params, kind },
    showGuest: true,
  });
}

export function renderCaptainUnassignedHtml(params: CaptainTripEmailParams): string {
  const kind = params.kind === "cancelled" ? "cancelled" : "unassigned";
  return captainEmailShell({
    subtitle: kind === "cancelled" ? "Trip canceled" : "You’re off this trip",
    greeting: params.captainName,
    intro:
      kind === "cancelled"
        ? "This trip was canceled. You no longer need to cover it."
        : "You’ve been taken off this trip. It will no longer appear on your calendar.",
    params: { ...params, kind },
    showGuest: false,
  });
}

export type TeamInviteEmailParams = {
  toName: string;
  roleLabel: "Captain" | "Operator";
  resetLink: string;
  loginUrl?: string;
};

export function getTeamInviteSubject(roleLabel: string): string {
  return `You're invited to ${brand.companyName} admin (${roleLabel})`;
}

function getAdminLoginUrl(): string {
  return `${bookingEnv.appBaseUrl.replace(/\/$/, "")}/admin/login`;
}

export function getCaptainCalendarUrl(): string {
  return `${bookingEnv.appBaseUrl.replace(/\/$/, "")}/admin/calendars`;
}

export function renderTeamInviteHtml(params: TeamInviteEmailParams): string {
  const name = params.toName.trim() || "there";
  const roleLabel = params.roleLabel === "Operator" ? "Operator" : "Captain";
  const resetLink = params.resetLink.trim();
  const loginUrl = (params.loginUrl?.trim() || getAdminLoginUrl()).replace(/\/$/, "");
  const subtitle = roleLabel === "Captain" ? "Captain invite" : "Operator invite";
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${EMAIL_HEAD_EXTRAS}
  <title>${escapeHtml(getTeamInviteSubject(roleLabel))}</title>
</head>
<body style="margin:0; padding:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: ${BG_LIGHT}; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${BG_LIGHT};">
    <tr>
      <td align="center" style="padding: 24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="${EMAIL_CARD}">
          <tr>
            ${renderEmailHeaderCell(escapeHtml(subtitle))}
          </tr>
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 20px; font-size: 16px; color: ${DARK_COLOR}; line-height: 1.5;">Hi ${escapeHtml(name)},</p>
              <p style="margin: 0 0 24px; font-size: 15px; color: ${MUTED_COLOR}; line-height: 1.6;">You've been invited as a <strong style="color: ${DARK_COLOR};">${escapeHtml(roleLabel)}</strong> for ${escapeHtml(brand.companyName)}. Set your password with the button below, then sign in with this email address.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin: 8px auto 24px;">
                <tr>
                  <td style="border-radius: 10px; background: ${DARK_COLOR};">
                    <a href="${escapeHtml(resetLink)}" target="_blank" rel="noopener" style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none;">Set your password</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 8px; font-size: 14px; color: ${MUTED_COLOR}; line-height: 1.5;">Sign in here after you set a password:</p>
              <p style="margin: 0 0 20px; font-size: 13px; word-break: break-all;"><a href="${escapeHtml(loginUrl)}" target="_blank" rel="noopener" style="color: ${PRIMARY_COLOR}; text-decoration: underline;">${escapeHtml(loginUrl)}</a></p>
              <p style="margin: 0; font-size: 12px; color: ${MUTED_COLOR}; line-height: 1.5;">If the button does not work, copy this link:</p>
              <p style="margin: 8px 0 0; font-size: 12px; color: ${MUTED_COLOR}; word-break: break-all;">${escapeHtml(resetLink)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 32px; background: ${BG_LIGHT}; border-top: 1px solid rgba(0,28,48,0.08); text-align: center;">
              <p style="margin: 0; font-size: 12px; color: ${MUTED_COLOR};">— ${escapeHtml(brand.companyName)}</p>
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

/** Sample booking + context for admin HTML preview. Uses realistic cents (e.g. $320 total). */
