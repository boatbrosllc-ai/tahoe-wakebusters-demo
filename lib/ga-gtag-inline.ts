import { isValidGoogleTagId } from "@/lib/ga-tag-id";

export type GtagInlineBootstrapOptions = {
  /** When true, GA4 labels hits as debug (see GA4 Admin → DebugView). Set via NEXT_PUBLIC_GA_DEBUG=1 while testing. */
  debugMode?: boolean;
  /** Optional Google Ads `AW-…` ID — adds `gtag('config', awId)` after GA4 config for Ads conversions. */
  googleAdsId?: string | null;
};

function escapeForSingleQuotedJs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function assertMeasurementId(measurementId: string): void {
  if (!isValidGoogleTagId(measurementId)) {
    throw new Error("[ga-gtag-inline] Invalid measurement ID");
  }
}

/**
 * dataLayer + gtag shim + `gtag('config')` only (no external script). For `/gtag-bootstrap` when the host
 * loads `gtag/js` separately, or tests.
 */
export function getGtagInlineBootstrapJs(measurementId: string, options?: GtagInlineBootstrapOptions): string {
  assertMeasurementId(measurementId);
  const configExtra =
    options?.debugMode === true ? ",{debug_mode:true,send_page_view:true}" : "";
  const adsId = options?.googleAdsId?.trim();
  const adsConfig =
    adsId && isValidGoogleTagId(adsId)
      ? `window.gtag('config','${escapeForSingleQuotedJs(adsId)}');`
      : "";
  return (
    "window.dataLayer=window.dataLayer||[];" +
    "if(typeof window.gtag!=='function'){" +
    "window.gtag=function(){window.dataLayer.push(arguments);};" +
    "}" +
    "window.gtag('js',new Date());" +
    `window.gtag('config','${escapeForSingleQuotedJs(measurementId)}'${configExtra});` +
    adsConfig
  );
}

/**
 * Full GA4 bootstrap in one script: queue config on dataLayer, then inject async `gtag/js`.
 * Works with CSP `strict-dynamic`: the nonce-approved inline script creates the external `<script>`.
 * Prefer this in `app/layout.tsx` instead of two separate `next/script` tags.
 */
export function getGtagFullBootstrapJs(measurementId: string, options?: GtagInlineBootstrapOptions): string {
  assertMeasurementId(measurementId);
  const configExtra =
    options?.debugMode === true ? ",{debug_mode:true,send_page_view:true}" : "";
  const adsId = options?.googleAdsId?.trim();
  const adsConfig =
    adsId && isValidGoogleTagId(adsId)
      ? "window.gtag('config','" + escapeForSingleQuotedJs(adsId) + "');"
      : "";
  const libUrl = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementId);
  return (
    "window.dataLayer=window.dataLayer||[];" +
    "if(typeof window.gtag!=='function'){" +
    "window.gtag=function(){window.dataLayer.push(arguments);};" +
    "}" +
    "window.gtag('js',new Date());" +
    "window.gtag('config','" +
    escapeForSingleQuotedJs(measurementId) +
    "'" +
    configExtra +
    ");" +
    adsConfig +
    "var _ga4s=document.createElement('script');" +
    "_ga4s.async=true;" +
    "_ga4s.src='" +
    libUrl.replace(/\\/g, "\\\\").replace(/'/g, "\\'") +
    "';" +
    "(document.head||document.documentElement).appendChild(_ga4s);"
  );
}
