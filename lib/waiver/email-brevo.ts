/**
 * Brevo implementation of waiver email adapter.
 * Server-side only. Uses BREVO_API_KEY (same as booking emails).
 */

import { brand } from "@/content/brand";
import { getNoreplyEmail, getSenderName } from "@/config/site";
import { bookingEnv } from "@/lib/booking/env";
import type { WaiverEmailAdapter, WaiverInviteParams, WaiverReminderParams } from "./email-adapter";
import { getDefaultTokenExpiryDays } from "./tokens";

const BREVO_API_BASE = "https://api.brevo.com/v3";
const PRIMARY = "#50bdba";
const DARK = "#001c30";
const PINK = "#f27a0a"; /* Brand secondary – logo orange logo */
const BG = "#f0fafb";

/** Header gradient: navy → teal → pink to match logo orange logo palette. */
const HEADER_GRADIENT = `linear-gradient(135deg, ${DARK} 0%, ${PRIMARY} 50%, ${PINK} 100%)`;

function getEmailLogoUrl(): string {
  const base = bookingEnv.appBaseUrl.replace(/\/$/, "");
  return `${base}${brand.logoEmailPath}`;
}

/** Header block matching booking emails: logo orange logo + subtitle on gradient. */
function waiverEmailHeader(subtitle: string): string {
  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto 24px;background:${HEADER_GRADIENT};border-radius:16px 16px 0 0;overflow:hidden;">
    <tr>
      <td style="padding:24px 28px;text-align:center;">
        <img src="${getEmailLogoUrl()}" alt="${brand.companyName}" width="260" height="72" style="max-width:260px;height:auto;display:block;margin:0 auto;" />
        <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.9);">${subtitle}</p>
      </td>
    </tr>
  </table>`;
}

function getHeaders(): Record<string, string> {
  return {
    "api-key": bookingEnv.brevoApiKey,
    "Content-Type": "application/json",
  };
}

function getSender(): { name: string; email: string } {
  const email = getNoreplyEmail();
  const name = getSenderName();
  return { name, email };
}

function formatBookingSummary(summary: WaiverInviteParams["bookingSummary"]): string {
  const parts: string[] = [];
  if (summary.experienceName) parts.push(`Experience: ${summary.experienceName}`);
  if (summary.tripDate) parts.push(`Date: ${summary.tripDate}`);
  if (summary.startTime || summary.endTime) {
    parts.push(`Time: ${[summary.startTime, summary.endTime].filter(Boolean).join(" – ")}`);
  }
  if (summary.partySize != null) parts.push(`Party size: ${summary.partySize}`);
  return parts.length ? parts.join("\n") : "Your booking";
}

function groupSigningBlock(groupSigningUrl: string, partySize: number | undefined): string {
  if (!groupSigningUrl.trim() || (partySize ?? 1) <= 1) return "";
  return `
    <p style="margin:20px 0 8px;font-size:14px;font-weight:600;color:${DARK};">For your other guests</p>
    <p style="margin:0 0 8px;font-size:14px;color:#196a87;line-height:1.5;">Each person needs to sign. Share this link with everyone in your party:</p>
    <p style="word-break:break-all;font-size:13px;margin:0 0 16px;"><a href="${groupSigningUrl}" style="color:#196a87;">${groupSigningUrl}</a></p>`;
}

function buildInviteHtml(params: WaiverInviteParams): string {
  const summary = formatBookingSummary(params.bookingSummary);
  const groupBlock = params.groupSigningUrl ? groupSigningBlock(params.groupSigningUrl, params.bookingSummary.partySize) : "";
  const expiryDays = getDefaultTokenExpiryDays();
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;background-color:${BG};">
  ${waiverEmailHeader("Sign your waiver")}
  <div style="background:#fff;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(0,28,48,0.08);overflow:hidden;padding:28px;">
    <p>Hi ${params.name},</p>
    <p>Please sign your waiver before your trip. It only takes a minute.</p>
    <div style="background:${BG};padding:16px;border-radius:8px;margin:16px 0;border:1px solid rgba(0,28,48,0.08);">
      <pre style="margin:0;white-space:pre-wrap;font-size:14px;">${summary}</pre>
    </div>
    <p><a href="${params.signingUrl}" style="display:inline-block;background:${DARK};color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;">Sign waiver</a></p>
    <p style="color:#196a87;font-size:14px;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="word-break:break-all;font-size:13px;">${params.signingUrl}</p>
    ${groupBlock}
    <p style="color:#196a87;font-size:14px;">These links stay valid for about <strong>${expiryDays} days</strong> (or until everyone has signed).</p>
  </div>
</body>
</html>`;
}

function buildReminderHtml(params: WaiverReminderParams): string {
  const summary = formatBookingSummary(params.bookingSummary);
  const groupBlock = params.groupSigningUrl ? groupSigningBlock(params.groupSigningUrl, params.bookingSummary.partySize) : "";
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;background-color:${BG};">
  ${waiverEmailHeader("Reminder: Sign your waiver")}
  <div style="background:#fff;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(0,28,48,0.08);overflow:hidden;padding:28px;">
    <p>Hi ${params.name},</p>
    <p>This is a friendly reminder to sign your waiver before your upcoming trip.</p>
    <div style="background:${BG};padding:16px;border-radius:8px;margin:16px 0;border:1px solid rgba(0,28,48,0.08);">
      <pre style="margin:0;white-space:pre-wrap;font-size:14px;">${summary}</pre>
    </div>
    <p><a href="${params.signingUrl}" style="display:inline-block;background:${DARK};color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:600;">Sign waiver</a></p>
    <p style="color:#196a87;font-size:14px;">If the button doesn't work, copy this link: ${params.signingUrl}</p>
    ${groupBlock}
  </div>
</body>
</html>`;
}

export const waiverEmailBrevo: WaiverEmailAdapter = {
  async sendWaiverInvite(params: WaiverInviteParams): Promise<void> {
    const res = await fetch(`${BREVO_API_BASE}/smtp/email`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        sender: getSender(),
        to: [{ email: params.to.trim(), name: params.name.trim() || undefined }],
        subject: `Sign your waiver – ${brand.companyName}`,
        htmlContent: buildInviteHtml(params),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Brevo waiver invite failed: ${res.status} ${text}`);
    }
  },

  async sendWaiverReminder(params: WaiverReminderParams): Promise<void> {
    const res = await fetch(`${BREVO_API_BASE}/smtp/email`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({
        sender: getSender(),
        to: [{ email: params.to.trim(), name: params.name.trim() || undefined }],
        subject: `Reminder: Sign your waiver – ${brand.companyName}`,
        htmlContent: buildReminderHtml(params),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Brevo waiver reminder failed: ${res.status} ${text}`);
    }
  },
};
