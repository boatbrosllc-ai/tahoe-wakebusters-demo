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
  const idJson = JSON.stringify(measurementId);
  const configExtra =
    options?.debugMode === true ? `,${JSON.stringify({ debug_mode: true, send_page_view: true })}` : "";
  return (
    "window.dataLayer=window.dataLayer||[];" +
    "if(typeof window.gtag!=='function'){" +
    "window.gtag=function(){window.dataLayer.push(arguments);};" +
    "}" +
    "window.gtag('js',new Date());" +
    `window.gtag('config',${idJson}${configExtra});`
  );
}
