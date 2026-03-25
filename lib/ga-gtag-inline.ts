/**
 * GA4 bootstrap snippet inlined after `gtag/js` (see `app/layout.tsx`).
 *
 * **Important:** The old pattern always did `function gtag(){...}`, which overwrites the real
 * `window.gtag` installed by `gtag/js` when the library finishes loading before this snippet runs
 * (easy to hit with HTTP cache). Then `gtag('config', …)` targets the stub and hits never reach GA4.
 * We only install the dataLayer queue shim when `gtag` is not already a function.
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
