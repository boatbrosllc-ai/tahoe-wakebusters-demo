export type GtagInlineBootstrapOptions = {
  /** When true, GA4 labels hits as debug (see GA4 Admin → DebugView). Set via NEXT_PUBLIC_GA_DEBUG=1 while testing. */
  debugMode?: boolean;
};

/**
 * Inline GA4 bootstrap for root `app/layout.tsx` and `/gtag-bootstrap`.
 *
 * **Important:** Do not always replace `window.gtag` — that can overwrite the real function from
 * `gtag/js` if load order shifts (e.g. cache). Only install the dataLayer shim when `gtag` is missing.
 */
export function getGtagInlineBootstrapJs(measurementId: string, options?: GtagInlineBootstrapOptions): string {
  // Single-quoted ID only (no JSON.stringify): avoids `\"` inside Next.js `__next_s` script serialization
  // breaking `gtag('config', ...)` in production HTML.
  if (!/^G-[A-Za-z0-9]{10}$/.test(measurementId)) {
    throw new Error("[ga-gtag-inline] Invalid measurement ID");
  }
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
