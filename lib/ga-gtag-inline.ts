/**
 * GA4 bootstrap after `gtag/js` has loaded (see `components/Ga4Scripts.tsx`).
 *
 * **Important:** The old pattern always did `function gtag(){...}`, which overwrites the real
 * `window.gtag` installed by `gtag/js` when the library finishes loading before this snippet runs
 * (easy to hit with HTTP cache). Then `gtag('config', …)` targets the stub and hits never reach GA4.
 * We only install the dataLayer queue shim when `gtag` is not already a function.
 */
export function runGa4Bootstrap(measurementId: string): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
  w.dataLayer = w.dataLayer || [];
  if (typeof w.gtag !== "function") {
    w.gtag = function gtag(...args: unknown[]) {
      w.dataLayer!.push(args);
    };
  }
  w.gtag("js", new Date());
  w.gtag("config", measurementId);
}

/** Legacy string form for `/gtag-bootstrap` route (kept for cache compatibility). */
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
