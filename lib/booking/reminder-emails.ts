/**
 * Booking reminder emails: 1-week, 24h before, day-of (3h before).
 * Shared content: directions/map, rideshare (Fetii boatbros), $5 cash park fee.
 * Waiver link included when provided (guest hasn't signed yet).
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

const PRIMARY = "#50bdba";
const DARK = "#001c30";
const PINK = "#fe3f93"; /* Brand secondary – Lockup Pink logo */
const MUTED = "#196a87";
const BG = "#f0fafb";

/** Header gradient: navy → teal → pink to match Lockup Pink logo palette. */
const HEADER_GRADIENT = `linear-gradient(135deg, ${DARK} 0%, ${PRIMARY} 50%, ${PINK} 100%)`;

function getEmailLogoUrl(): string {
  const base = bookingEnv.appBaseUrl.replace(/\/$/, "");
  return `${base}${brand.logoEmailPath}`;
}

/** Header row with Boat Bros Lockup Pink logo and subtitle (for gradient background). */
function reminderHeaderHtml(subtitle: string): string {
  return `<td style="background: ${HEADER_GRADIENT}; padding: 24px 28px; text-align: center;"><img src="${getEmailLogoUrl()}" alt="Boat Bros ATX" width="260" height="72" style="max-width:260px;height:auto;display:block;margin:0 auto;" /><p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.9);">${subtitle}</p></td>`;
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

/** Shared block: directions, map, rideshare (Fetii boatbros), $5 cash. */
function sharedInstructionsHtml(params: BookingReminderParams): string {
  const mapLink = params.locationAddress
    ? mapUrl(params.locationAddress)
    : params.locationText
      ? mapUrl(params.locationText)
      : null;
  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: ${BG}; border-radius: 12px; margin: 16px 0; border: 1px solid rgba(0,28,48,0.08);">
    <tr>
      <td style="padding: 20px 24px;">
        <p style="margin: 0 0 12px; font-size: 14px; font-weight: 600; color: ${DARK};">📍 Directions &amp; logistics</p>
        <p style="margin: 0 0 8px; font-size: 14px; color: ${MUTED}; line-height: 1.5;">${escapeHtml(params.locationText)}</p>
        ${mapLink ? `<p style="margin: 0 0 16px;"><a href="${escapeHtml(mapLink)}" target="_blank" rel="noopener" style="color: ${PRIMARY}; font-weight: 600;">View on map / Get directions</a></p>` : ""}
        <p style="margin: 0 0 8px; font-size: 14px; color: ${MUTED}; line-height: 1.5;"><strong style="color: ${DARK};">Parking is limited.</strong> We recommend rideshare when possible. Use <a href="https://www.fetii.com?promo=boatbros" target="_blank" rel="noopener" style="color: ${PRIMARY}; font-weight: 600;">Fetii</a> for group rides—promo code <strong style="color: ${DARK};">boatbros</strong> for Boat Bros guests.</p>
        <p style="margin: 0; font-size: 14px; color: ${MUTED}; line-height: 1.5;">Bring <strong style="color: ${DARK};">$5 cash per person</strong> for the park entry fee.</p>
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
          <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:${DARK};">— Boat Bros ATX</p>
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
          <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:${DARK};">— Boat Bros ATX</p>
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
          <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:${DARK};">— Boat Bros ATX</p>
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
      return `One week until your ${experienceName} – Boat Bros ATX`;
    case "24h":
      return `Tomorrow: We're excited to see you – Boat Bros ATX`;
    case "dayof":
      return `Today's the day – let's have a blast! – Boat Bros ATX`;
    default:
      return `Reminder: ${experienceName} – Boat Bros ATX`;
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
}

const FINAL_PAYMENT_SUBJECT = "Complete your payment – Boat Bros ATX";

export function buildFinalPaymentRequestHtml(params: FinalPaymentRequestParams): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BASE_STYLES}">
  <div style="padding: 24px 16px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="${CONTAINER}">
      <tr>
        ${reminderHeaderHtml("Final payment due – 48 hours until your trip")}
      </tr>
      <tr>
        <td style="padding: 28px;">
          <p style="margin:0 0 16px;font-size:16px;color:${DARK};line-height:1.5;">Hi ${escapeHtml(params.customerName)},</p>
          <p style="margin:0 0 16px;font-size:15px;color:${MUTED};line-height:1.6;">Your <strong style="color:${DARK};">${escapeHtml(params.experienceName)}</strong> is in 48 hours—<strong style="color:${DARK};">${escapeHtml(params.tripDate)}</strong> at <strong style="color:${DARK};">${escapeHtml(params.startTime)}</strong>. Please complete your remaining balance so you&apos;re all set.</p>
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
          <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:${DARK};">— Boat Bros ATX</p>
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
