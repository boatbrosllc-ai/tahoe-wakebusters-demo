/**
 * Google Ads contact conversions from the site.
 *
 * **Recommended (matches Google’s event snippet):** set `NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_SEND_TO`
 * to the full `send_to` string from Ads → Conversions → your action → Tag setup → Event snippet,
 * e.g. `AW-123456789/AbC-dEfGhIjKl`. We fire:
 *   gtag('event', 'conversion', { send_to: '…' })
 *
 * **Alternate (some “Google tag” UIs):** if Google only shows a named event like `ads_conversion_Contact_Us_1`,
 * set `NEXT_PUBLIC_GOOGLE_ADS_ID=AW-…` and optionally `NEXT_PUBLIC_GOOGLE_ADS_CONTACT_EVENT`.
 */
import { parseGoogleTagId } from "@/lib/ga-tag-id";

/** `AW-123456789/label` from the Ads conversion event snippet (`send_to`). Label chars vary by account. */
const CONVERSION_SEND_TO_REGEX = /^AW-\d+\/[^/\s]+$/i;

export function getGoogleAdsConversionSendTo(): string | null {
  const raw = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_SEND_TO?.trim();
  if (!raw) return null;
  if (!CONVERSION_SEND_TO_REGEX.test(raw)) {
    console.error(
      "[google-ads-id] NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_SEND_TO must look like AW-123456789/YourLabel (copy from Google Ads event snippet send_to)."
    );
    return null;
  }
  return raw;
}

/** Optional second `gtag('config', 'AW-…')` after GA4 (only if Google’s global tag asks for it). */
export function getGoogleAdsId(): string | null {
  const raw = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  if (raw === undefined) return null;
  const parsed = parseGoogleTagId(raw);
  if (parsed.kind === "empty" || parsed.kind === "disabled") return null;
  if (parsed.kind !== "valid") {
    console.error(
      `[google-ads-id] NEXT_PUBLIC_GOOGLE_ADS_ID is malformed (${JSON.stringify(parsed.raw)}). Use AW-… from your Google tag setup, or leave unset.`
    );
    return null;
  }
  const id = parsed.normalized;
  if (id == null || !id.startsWith("AW-")) {
    console.error(
      "[google-ads-id] NEXT_PUBLIC_GOOGLE_ADS_ID must start with AW- when set (optional; prefer CONVERSION_SEND_TO for conversions)."
    );
    return null;
  }
  return id;
}

/** Named event for alternate Google tag UI (default Contact name Google often shows). */
export function getGoogleAdsContactConversionEventName(): string {
  const custom = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONTACT_EVENT?.trim();
  if (custom) return custom;
  return "ads_conversion_Contact_Us_1";
}

/** Fire Ads contact conversion on successful submit when send_to or legacy AW+event path is configured. */
export function isGoogleAdsContactConversionConfigured(): boolean {
  return Boolean(getGoogleAdsConversionSendTo() || process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim());
}

/** Named `gtag('event', '…')` path when there is no send_to (legacy / alternate UI). */
export function googleAdsContactUsesNamedEvent(): boolean {
  return !getGoogleAdsConversionSendTo() && Boolean(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim());
}
