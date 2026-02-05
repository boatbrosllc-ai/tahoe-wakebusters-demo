/**
 * Simple event logger abstraction. No vendor hardcoding.
 * TODO: Swap implementation to send to GA4, GTM, Plausible, etc.
 */

export type AnalyticsEvent =
  | { name: "book_cta_click"; payload: { source: string; page: string; experience?: string } }
  | { name: "call_click"; payload: { source: string; page?: string } }
  | { name: "lead_submit"; payload: { source: string; page?: string } }
  | { name: "contact_submit"; payload: { source: string } };

function logEvent(event: AnalyticsEvent): void {
  if (typeof window === "undefined") return;
  // eslint-disable-next-line no-console
  console.log("[Analytics]", event.name, event.payload);
  // TODO: window.gtag?.("event", event.name, event.payload);
  // TODO: window.plausible?.(event.name, { props: event.payload });
}

export const analytics = {
  bookCtaClick(source: string, page: string, experience?: string) {
    logEvent({ name: "book_cta_click", payload: { source, page, experience } });
  },
  callClick(source: string, page?: string) {
    logEvent({ name: "call_click", payload: { source, page: page ?? "" } });
  },
  leadSubmit(source: string, page?: string) {
    logEvent({ name: "lead_submit", payload: { source, page: page ?? "" } });
  },
  contactSubmit(source: string) {
    logEvent({ name: "contact_submit", payload: { source } });
  },
};
