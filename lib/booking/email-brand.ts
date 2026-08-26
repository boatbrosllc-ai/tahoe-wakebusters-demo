import { brand } from "@/content/brand";
import { bookingEnv } from "./env";

export const EMAIL_NAVY = "#04244a";
export const EMAIL_TEAL = "#14b6dc";
export const EMAIL_ACCENT = "#f27a0a";
export const EMAIL_HEADER_GRADIENT = `linear-gradient(135deg, ${EMAIL_NAVY} 0%, ${EMAIL_TEAL} 50%, ${EMAIL_ACCENT} 100%)`;

/**
 * Square lockup display size. Gmail iOS often ignores CSS max-width and uses the HTML
 * width/height attributes. Keep this small enough for a ~320px phone after side padding.
 */
export const EMAIL_LOGO_PX = 160;

export function getEmailLogoUrl(): string {
  const base = bookingEnv.appBaseUrl.replace(/\/$/, "");
  const path = brand.logoEmailPath?.startsWith("/")
    ? brand.logoEmailPath
    : `/${brand.logoEmailPath || "logo.png"}`;
  return `${base}${path}`;
}

export function renderEmailLogoImg(): string {
  const src = getEmailLogoUrl();
  const px = EMAIL_LOGO_PX;
  const alt = brand.companyName.replace(/"/g, "&quot;");
  return `<table role="presentation" align="center" width="${px}" border="0" cellspacing="0" cellpadding="0" class="email-logo-wrap" style="width:${px}px;margin:0 auto;">
  <tr>
    <td align="center" style="padding:0;font-size:0;line-height:0;">
      <img src="${src}" alt="${alt}" width="${px}" height="${px}" class="email-logo" style="display:block;border:0;outline:none;text-decoration:none;width:${px}px;height:${px}px;-ms-interpolation-mode:bicubic;" />
    </td>
  </tr>
</table>`;
}

/** Header cell: navy bgcolor so Gmail still shows a dark bar when it strips CSS gradients. */
export function renderEmailHeaderCell(subtitleHtml: string): string {
  return `<td align="center" bgcolor="${EMAIL_NAVY}" style="background-color:${EMAIL_NAVY};background:${EMAIL_HEADER_GRADIENT};padding:20px 16px;text-align:center;">${renderEmailLogoImg()}<p style="margin:10px 0 0;font-size:14px;line-height:1.4;color:#ffffff;">${subtitleHtml}</p></td>`;
}

export const EMAIL_HEAD_EXTRAS = `<meta name="x-apple-disable-message-reformatting"><style type="text/css">@media only screen and (max-width:480px){.email-logo-wrap{width:140px!important;}.email-logo{width:140px!important;height:140px!important;}}</style>`;
