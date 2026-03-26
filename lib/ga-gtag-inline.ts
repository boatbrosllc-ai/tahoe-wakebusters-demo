export type GtagInlineBootstrapOptions = {
  /** When true, GA4 labels hits as debug (see GA4 Admin → DebugView). Set via NEXT_PUBLIC_GA_DEBUG=1 while testing. */
  debugMode?: boolean;
};

function assertMeasurementId(measurementId: string): void {
  if (!/^G-[A-Za-z0-9]{10}$/.test(measurementId)) {
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
  return (
    "window.dataLayer=window.dataLayer||[];" +
    "if(typeof window.gtag!=='function'){" +
    "window.gtag=function(){window.dataLayer.push(arguments);};" +
    "}" +
    "window.gtag('js',new Date());" +
    `window.gtag('config','${measurementId}'${configExtra});`
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
  const libUrl = "https://www.googletagmanager.com/gtag/js?id=" + measurementId;
  return (
    "window.dataLayer=window.dataLayer||[];" +
    "if(typeof window.gtag!=='function'){" +
    "window.gtag=function(){window.dataLayer.push(arguments);};" +
    "}" +
    "window.gtag('js',new Date());" +
    "window.gtag('config','" +
    measurementId +
    "'" +
    configExtra +
    ");" +
    "var _ga4s=document.createElement('script');" +
    "_ga4s.async=true;" +
    "_ga4s.src='" +
    libUrl +
    "';" +
    "(document.head||document.documentElement).appendChild(_ga4s);"
  );
}
