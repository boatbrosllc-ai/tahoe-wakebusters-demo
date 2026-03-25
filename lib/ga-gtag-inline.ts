/**
 * Inline GA4 bootstrap for root `app/layout.tsx` and `/gtag-bootstrap`.
 *
 * **Important:** Do not always replace `window.gtag` — that can overwrite the real function from
 * `gtag/js` if load order shifts (e.g. cache). Only install the dataLayer shim when `gtag` is missing.
 */
export function getGtagInlineBootstrapJs(measurementId: string): string {
  const idJson = JSON.stringify(measurementId);
  return (
    "window.dataLayer=window.dataLayer||[];" +
    "if(typeof window.gtag!=='function'){" +
    "window.gtag=function(){window.dataLayer.push(arguments);};" +
    "}" +
    "window.gtag('js',new Date());" +
    `window.gtag('config',${idJson});`
  );
}
