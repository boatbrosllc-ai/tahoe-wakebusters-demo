/**
 * Booking reminder emails: 1-week, 24h before, day-of (3h before).
 * Shared content: marina directions / map. Waiver link when provided.
 */

import { brand } from "@/content/brand";
import { bookingEnv } from "./env";

export interface BookingReminderParams {
  to: string;
  customerName: string;
  experienceName: string;
  tripDate: string;
  startTime: string;
  /** Location / meeting point text for display. */
  locationText: string;
  /** Address for map link (optional). */
  locationAddress?: string;
  /** If waiver not yet signed, pass signing URL to include in email. */
  waiverSigningUrl?: string | null;
  /** Share link for additional party members (when party size &gt; 1). */
  waiverGroupSigningUrl?: string | null;
  /** Short "what to bring" (e.g. from experience). */
  whatToBring?: string[];
}

const PRIMARY = "#14b6dc";
const DARK = "#04244a";
const ORANGE = "#f27a0a";
const MUTED = "#1a5a7a";
const BG = "#e8f6fa";

/** Header gradient: navy → teal → orange. */
const HEADER_GRADIENT = `linear-gradient(135deg, ${DARK} 0%, ${PRIMARY} 50%, ${ORANGE} 100%)`;

function getEmailLogoUrl(): string {
  const base = bookingEnv.appBaseUrl.replace(/\/$/, "");
  return `${base}${brand.logoEmailPath}`;
}

/** Header row with ${brand.companyName} logo and subtitle. */
function reminderHeaderHtml(subtitle: string): string {
  return `<td style="background: ${HEADER_GRADIENT}; padding: 24px 28px; text-align: center;"><img src="${getEmailLogoUrl()}" alt="${brand.companyName}" width="260" height="72" style="max-width:260px;height:auto;display:block;margin:0 auto;" /><p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.9);">${subtitle}</p></td>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mapUrl(address: string): string {
  const q = encodeURIComponent(address.trim());
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/** Shared block: marina directions and map. */
function sharedInstructionsHtml(params: BookingReminderParams): string {
  const mapLink = params.locationAddress
    ? mapUrl(params.locationAddress)
    : params.locationText
      ? mapUrl(params.locationText)
      : null;
  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: ${BG}; border-radius: 12px; margin: 16px 0; border: 1px solid rgba(10,22,40,0.08);">
    <tr>
      <td style="padding: 20px 24px;">
        <p style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: ${DARK};">📍 Marina meet-up</p>
        <p style="margin: 0 0 8px; font-size: 14px; color: ${MUTED}; line-height: 1.5;">${escapeHtml(params.locationText)}</p>
        ${mapLink ? `<p style="margin: 0 0 16px;"><a href="${escapeHtml(mapLink)}" target="_blank" rel="noopener" style="color: ${PRIMARY}; font-weight: 600;">View on map / Get directions</a></p>` : ""}
        <p style="margin: 0 0 8px; font-size: 14px; color: ${MUTED}; line-height: 1.5;"><strong style="color: ${DARK};">Arrive a little early</strong> so we can load coolers, brief the crew, and cast off on time. Exact slip instructions are in your confirmation.</p>
        <p style="margin: 0; font-size: 14px; color: ${MUTED}; line-height: 1.5;">Bring sunscreen, soft-soled shoes, sunglasses, and a soft cooler if you want drinks or snacks.</p>
      </td>
    </tr>
  </table>`;
}

/** Waiver block (only when waiverSigningUrl is set). */
function waiverBlockHtml(waiverSigningUrl: string, waiverGroupSigningUrl?: string | null): string {
  const group =
    waiverGroupSigningUrl && waiverGroupSigningUrl.trim()
      ? `
        <p style="margin: 16px 0 8px; font-size: 14px; color: ${MUTED}; line-height: 1.5;"><strong style="color:${DARK};">Other guests in your party:</strong> each person needs to sign. Share this link:</p>
        <p style="margin: 0; word-break: break-all; font-size: 13px;"><a href="${escapeHtml(waiverGroupSigningUrl)}" target="_blank" rel="noopener" style="color: ${PRIMARY};">${escapeHtml(waiverGroupSigningUrl)}</a></p>`
      : "";
  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 20px 0;">
    <tr>
      <td style="background: #fef3c7; border-radius: 12px; padding: 16px 20px; border: 1px solid #f59e0b;">
        <p style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: ${DARK};">✍️ Sign your waiver</p>
        <p style="margin: 0 0 12px; font-size: 14px; color: ${MUTED}; line-height: 1.5;">You still need to sign the waiver before your trip. It only takes a minute.</p>
        <a href="${escapeHtml(waiverSigningUrl)}" target="_blank" rel="noopener" style="display: inline-block; background: ${DARK}; color: #fff; padding: 12px 24px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px;">Sign waiver now</a>
        ${group}
      </td>
    </tr>
  </table>`;
}

function whatToBringHtml(whatToBring?: string[]): string {
  if (!whatToBring?.length) return "";
  const list = whatToBring.map((item) => `<li style="margin: 4px 0;">${escapeHtml(item)}</li>`).join("");
  return `
  <p style="margin: 16px 0 8px; font-size: 14px; font-weight: 600; color: ${DARK};">Don&apos;t forget to bring:</p>
  <ul style="margin: 0 0 16px; padding-left: 20px; font-size: 14px; color: ${MUTED}; line-height: 1.6;">${list}</ul>`;
}

const BASE_STYLES = `margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:${BG};`;
const CONTAINER = `max-width:560px;margin:0 auto;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,28,48,0.08);overflow:hidden;`;

export function buildReminder1WeekHtml(params: BookingReminderParams): string {
  const waiverBlock = params.waiverSigningUrl
    ? waiverBlockHtml(params.waiverSigningUrl, params.waiverGroupSigningUrl)
    : "";
  const instructions = sharedInstructionsHtml(params);
  const bring = whatToBringHtml(params.whatToBring);
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BASE_STYLES}">
  <div style="padding: 24px 16px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="${CONTAINER}">
      <tr>
        ${reminderHeaderHtml("One week until your trip")}
      </tr>
      <tr>
        <td style="padding: 28px;">
          <p style="margin:0 0 16px;font-size:16px;color:${DARK};line-height:1.5;">Hi ${escapeHtml(params.customerName)},</p>
          <p style="margin:0 0 16px;font-size:15px;color:${MUTED};line-height:1.6;">Your <strong style="color:${DARK};">${escapeHtml(params.experienceName)}</strong> is in one week—${escapeHtml(params.tripDate)} at ${escapeHtml(params.startTime)}.</p>
          ${waiverBlock}
          <p style="margin:16px 0 8px;font-size:14px;color:${MUTED};line-height:1.6;">Here&apos;s a quick refresher so you&apos;re all set:</p>
          ${instructions}
          ${bring}
          <p style="margin:20px 0 0;font-size:14px;color:${MUTED};">See you on the water!</p>
          <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:${DARK};">— ${brand.companyName}</p>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`.trim();
}

export function buildReminder24hHtml(params: BookingReminderParams): string {
  const waiverBlock = params.waiverSigningUrl
    ? waiverBlockHtml(params.waiverSigningUrl, params.waiverGroupSigningUrl)
    : "";
  const instructions = sharedInstructionsHtml(params);
  const bring = whatToBringHtml(params.whatToBring);
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BASE_STYLES}">
  <div style="padding: 24px 16px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="${CONTAINER}">
      <tr>
        ${reminderHeaderHtml("Tomorrow's the day")}
      </tr>
      <tr>
        <td style="padding: 28px;">
          <p style="margin:0 0 16px;font-size:16px;color:${DARK};line-height:1.5;">Hi ${escapeHtml(params.customerName)},</p>
          <p style="margin:0 0 16px;font-size:15px;color:${MUTED};line-height:1.6;">We&apos;re excited to see you <strong style="color:${DARK};">tomorrow at ${escapeHtml(params.startTime)}</strong> for your ${escapeHtml(params.experienceName)}!</p>
          ${waiverBlock}
          <p style="margin:16px 0 8px;font-size:14px;color:${MUTED};line-height:1.6;">Don&apos;t forget:</p>
          ${instructions}
          ${bring}
          <p style="margin:20px 0 0;font-size:14px;color:${MUTED};">Get some rest—tomorrow we&apos;re on the water.</p>
          <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:${DARK};">— ${brand.companyName}</p>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`.trim();
}

export function buildReminderDayOfHtml(params: BookingReminderParams): string {
  const waiverBlock = params.waiverSigningUrl
    ? waiverBlockHtml(params.waiverSigningUrl, params.waiverGroupSigningUrl)
    : "";
  const instructions = sharedInstructionsHtml(params);
  const bring = whatToBringHtml(params.whatToBring);
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BASE_STYLES}">
  <div style="padding: 24px 16px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="${CONTAINER}">
      <tr>
        ${reminderHeaderHtml("Today's the day—let's have a blast")}
      </tr>
      <tr>
        <td style="padding: 28px;">
          <p style="margin:0 0 16px;font-size:16px;color:${DARK};line-height:1.5;">Hi ${escapeHtml(params.customerName)},</p>
          <p style="margin:0 0 16px;font-size:15px;color:${MUTED};line-height:1.6;">Today&apos;s the day! Your <strong style="color:${DARK};">${escapeHtml(params.experienceName)}</strong> is at <strong style="color:${DARK};">${escapeHtml(params.startTime)}</strong>. We can&apos;t wait to get you on the water.</p>
          ${waiverBlock}
          <p style="margin:16px 0 8px;font-size:14px;color:${MUTED};line-height:1.6;">Quick checklist:</p>
          ${instructions}
          ${bring}
          <p style="margin:20px 0 0;font-size:14px;color:${MUTED};">See you in a few hours—let&apos;s make it a great one.</p>
          <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:${DARK};">— ${brand.companyName}</p>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`.trim();
}

export type ReminderType = "1week" | "24h" | "dayof";

export function buildReminderHtml(type: ReminderType, params: BookingReminderParams): string {
  switch (type) {
    case "1week":
      return buildReminder1WeekHtml(params);
    case "24h":
      return buildReminder24hHtml(params);
    case "dayof":
      return buildReminderDayOfHtml(params);
    default:
      return buildReminder1WeekHtml(params);
  }
}

export function getReminderSubject(type: ReminderType, experienceName: string): string {
  switch (type) {
    case "1week":
      return `One week until your ${experienceName} – ${brand.companyName}`;
    case "24h":
      return `Tomorrow: We're excited to see you – ${brand.companyName}`;
    case "dayof":
      return `Today's the day – let's have a blast! – ${brand.companyName}`;
    default:
      return `Reminder: ${experienceName} – ${brand.companyName}`;
  }
}

/** Params for the "final payment request" email (48h before trip, deposit paid / final_due). */
export interface FinalPaymentRequestParams {
  to: string;
  customerName: string;
  experienceName: string;
  tripDate: string;
  startTime: string;
  /** Formatted amount, e.g. "$150.00" */
  amountFormatted: string;
  /** Full URL to pay (manage booking page with token). */
  payLink: string;
  /**
   * Fractional hours until trip start. When set, header/body use the nearest hour so copy matches the ~46–50h send window.
   */
  hoursUntilTrip?: number;
}

const FINAL_PAYMENT_SUBJECT = `Complete your payment – ${brand.companyName}`;

export function buildFinalPaymentRequestHtml(params: FinalPaymentRequestParams): string {
  const hoursRounded =
    typeof params.hoursUntilTrip === "number" && Number.isFinite(params.hoursUntilTrip)
      ? Math.round(params.hoursUntilTrip)
      : null;
  const headerSubtitle =
    hoursRounded != null
      ? `Final payment due — about ${hoursRounded} hours until your trip`
      : "Final payment due soon — your trip is coming up";
  const tripTimingLead =
    hoursRounded != null
      ? `Your <strong style="color:${DARK};">${escapeHtml(params.experienceName)}</strong> is in about ${hoursRounded} hours—<strong style="color:${DARK};">${escapeHtml(params.tripDate)}</strong> at <strong style="color:${DARK};">${escapeHtml(params.startTime)}</strong>. Please complete your remaining balance so you&apos;re all set.`
      : `Your <strong style="color:${DARK};">${escapeHtml(params.experienceName)}</strong> is coming up soon—<strong style="color:${DARK};">${escapeHtml(params.tripDate)}</strong> at <strong style="color:${DARK};">${escapeHtml(params.startTime)}</strong>. Please complete your remaining balance so you&apos;re all set.`;
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BASE_STYLES}">
  <div style="padding: 24px 16px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="${CONTAINER}">
      <tr>
        ${reminderHeaderHtml(headerSubtitle)}
      </tr>
      <tr>
        <td style="padding: 28px;">
          <p style="margin:0 0 16px;font-size:16px;color:${DARK};line-height:1.5;">Hi ${escapeHtml(params.customerName)},</p>
          <p style="margin:0 0 16px;font-size:15px;color:${MUTED};line-height:1.6;">${tripTimingLead}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #f0fdf4; border-radius: 12px; margin: 20px 0; border: 1px solid rgba(34,197,94,0.3);">
            <tr>
              <td style="padding: 20px 24px;">
                <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: ${DARK};">Remaining balance</p>
                <p style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: ${DARK};">${escapeHtml(params.amountFormatted)}</p>
                <a href="${escapeHtml(params.payLink)}" target="_blank" rel="noopener" style="display: inline-block; background: ${PRIMARY}; color: #fff; padding: 14px 28px; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">Pay now</a>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:14px;color:${MUTED};line-height:1.6;">This link takes you to your booking where you can pay securely. After payment, your booking will be marked paid and you&apos;re good to go.</p>
          <p style="margin:20px 0 0;font-size:14px;color:${MUTED};">See you on the water!</p>
          <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:${DARK};">— ${brand.companyName}</p>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`.trim();
}

export function getFinalPaymentRequestSubject(): string {
  return FINAL_PAYMENT_SUBJECT;
}
