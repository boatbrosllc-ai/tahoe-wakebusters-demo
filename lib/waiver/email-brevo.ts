/**
 * Brevo implementation of waiver email adapter.
 * Server-side only. Uses BREVO_API_KEY (same as booking emails).
 */

import { brand } from "@/content/brand";
import { bookingEnv } from "@/lib/booking/env";
import type { WaiverEmailAdapter, WaiverInviteParams, WaiverReminderParams } from "./email-adapter";

const BREVO_API_BASE = "https://api.brevo.com/v3";
const PRIMARY = "#50bdba";
const DARK = "#001c30";
const PINK = "#fe3f93"; /* Brand secondary – Lockup Pink logo */
const BG = "#f0fafb";

/** Header gradient: navy → teal → pink to match Lockup Pink logo palette. */
const HEADER_GRADIENT = `linear-gradient(135deg, ${DARK} 0%, ${PRIMARY} 50%, ${PINK} 100%)`;

function getEmailLogoUrl(): string {
  const base = bookingEnv.appBaseUrl.replace(/\/$/, "");
  return `${base}${brand.logoEmailPath}`;
}

/** Header block matching booking emails: Lockup Pink logo + subtitle on gradient. */
function waiverEmailHeader(subtitle: string): string {
  return `
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto 24px;background:${HEADER_GRADIENT};border-radius:16px 16px 0 0;overflow:hidden;">
    <tr>
      <td style="padding:24px 28px;text-align:center;">
        <img src="${getEmailLogoUrl()}" alt="Boat Bros ATX" width="260" height="72" style="max-width:260px;height:auto;display:block;margin:0 auto;" />
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
  const email = process.env.BREVO_SENDER_EMAIL?.trim() || "noreply@boatbrosatx.com";
  const name = process.env.BREVO_SENDER_NAME?.trim() || "Boat Bros ATX";
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

function buildInviteHtml(params: WaiverInviteParams): string {
  const summary = formatBookingSummary(params.bookingSummary);
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
    <p style="color:#196a87;font-size:14px;">This link is unique to you and will expire after 30 days.</p>
  </div>
</body>
</html>`;
}

function buildReminderHtml(params: WaiverReminderParams): string {
  const summary = formatBookingSummary(params.bookingSummary);
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
        subject: "Sign your waiver – Boat Bros ATX",
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
        subject: "Reminder: Sign your waiver – Boat Bros ATX",
        htmlContent: buildReminderHtml(params),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Brevo waiver reminder failed: ${res.status} ${text}`);
    }
  },
};
