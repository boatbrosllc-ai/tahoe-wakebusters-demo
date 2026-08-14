/**
 * Active customer site configuration.
 *
 * Identity, branding, and theme live in `sites/<id>/config.ts`.
 * This module resolves the active site from `SLIPSTACK_SITE_ID` and keeps the
 * historical `siteConfig` export so shared engine code does not import a
 * customer folder directly.
 *
 * Secrets and Firebase/Stripe project IDs belong in environment variables —
 * see `.env.example`. Do not assume every customer shares one database.
 */

import { getSiteConfig } from "@/config/resolve-site";

export type { SiteConfig, SiteId } from "@/config/site-types";
export { SITE_IDS } from "@/config/site-types";
export { getActiveSiteId, getSiteConfig, isSiteId, SITE_REGISTRY } from "@/config/resolve-site";

export const siteConfig = getSiteConfig();

/** Public site origin. Prefer NEXT_PUBLIC_SITE_URL; fall back to configured domain. */
export function getSiteBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return `https://${siteConfig.company.domain}`.replace(/\/+$/, "");
}

export function getNoreplyEmail(): string {
  return process.env.BREVO_SENDER_EMAIL?.trim() || `noreply@${siteConfig.company.domain}`;
}

export function getSenderName(): string {
  return process.env.BREVO_SENDER_NAME?.trim() || siteConfig.company.name;
}

export function getContactEmail(): string {
  return process.env.CONTACT_EMAIL?.trim() || siteConfig.contact.email;
}

export function emailSubjectSuffix(): string {
  return ` – ${siteConfig.company.name}`;
}

/** Show the platform-dev identity bar in non-production (or when explicitly enabled). */
export function isPlatformDevBannerEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_SHOW_PLATFORM_BANNER === "0") return false;
  if (process.env.NEXT_PUBLIC_SHOW_PLATFORM_BANNER === "1") return true;
  return process.env.NODE_ENV !== "production";
}

/** Inline CSS variables so Tailwind `brand.*` tokens follow the active site theme. */
export function siteThemeCssVars(): Record<string, string> {
  const t = siteConfig.theme;
  return {
    "--brand-primary": t.primaryColor,
    "--brand-secondary": t.secondaryColor,
    "--brand-accent": t.accentColor,
    "--brand-dark": t.darkColor,
    "--brand-muted": t.mutedColor,
    "--brand-bg": t.backgroundColor,
    "--brand-text": t.textColor,
    "--brand-silver": t.silverColor,
    "--brand-radius": t.borderRadius,
  };
}
