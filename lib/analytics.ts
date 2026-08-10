import { sendGaFallbackEvent } from "@/lib/ga-fallback-client";
import {
  getGoogleAdsContactConversionEventName,
  getGoogleAdsConversionSendTo,
  isGoogleAdsContactConversionConfigured,
  googleAdsContactUsesNamedEvent,
} from "@/lib/google-ads-id";

/**
 * Client-side analytics: GA4 when `gtag.js` is loaded (see `app/layout.tsx` + `lib/ga-measurement-id.ts`),
 * plus GTM `dataLayer` and Plausible if present.
 */

export type AnalyticsEvent =
  | { name: "book_cta_click"; payload: { source: string; page: string; experience?: string } }
  | { name: "call_click"; payload: { source: string; page?: string } }
  | { name: "lead_submit"; payload: { source: string; page?: string } }
  | { name: "contact_submit"; payload: { source: string } }
  | { name: "seo_check_availability_click"; payload: { page: string; experience?: string } }
  | { name: "booking_step_1_category_selected"; payload: Record<string, never> }
  | { name: "booking_step_2_date_selected"; payload: Record<string, never> }
  | { name: "booking_step_4_payment_started"; payload: Record<string, never> }
  | { name: "booking_completed"; payload: { booking_id?: string; receipt_token?: string } };

type GtagFn = (...args: unknown[]) => void;

function logEvent(event: AnalyticsEvent): void {
  if (typeof window === "undefined") return;
  const w = window as Window & {
    gtag?: GtagFn;
    plausible?: (name: string, opts?: { props?: Record<string, unknown> }) => void;
    dataLayer?: unknown[];
  };
  const payload = { ...event.payload, event_category: "booking" };
  const hasGtag = typeof w.gtag === "function";
  if (hasGtag) {
    w.gtag!("event", event.name, payload);
  } else {
    void sendGaFallbackEvent(event.name, payload);
  }
  w.dataLayer = w.dataLayer ?? [];
  w.dataLayer.push({ event: event.name, ...payload });
  if (typeof w.plausible === "function") {
    try {
      w.plausible(event.name, { props: payload });
    } catch {
      /* optional third-party */
    }
  }
}

export const analytics = {
  bookCtaClick(source: string, page: string, experience?: string) {
    logEvent({ name: "book_cta_click", payload: { source, page, experience } });
    if (source.startsWith("seo_") || source === "seo_page") {
      logEvent({
        name: "seo_check_availability_click",
        payload: { page, experience },
      });
    }
  },
  callClick(source: string, page?: string) {
    logEvent({ name: "call_click", payload: { source, page: page ?? "" } });
  },
  leadSubmit(source: string, page?: string) {
    logEvent({ name: "lead_submit", payload: { source, page: page ?? "" } });
  },
  contactSubmit(source: string) {
    logEvent({ name: "contact_submit", payload: { source } });
    if (!isGoogleAdsContactConversionConfigured() || typeof window === "undefined") return;
    const w = window as Window & { gtag?: GtagFn };
    if (typeof w.gtag !== "function") return;
    const sendTo = getGoogleAdsConversionSendTo();
    try {
      if (sendTo) {
        w.gtag("event", "conversion", { send_to: sendTo });
      } else if (googleAdsContactUsesNamedEvent()) {
        w.gtag("event", getGoogleAdsContactConversionEventName(), {});
      }
    } catch {
      /* non-fatal */
    }
  },
  bookingStep1CategorySelected() {
    logEvent({ name: "booking_step_1_category_selected", payload: {} });
  },
  bookingStep2DateSelected() {
    logEvent({ name: "booking_step_2_date_selected", payload: {} });
  },
  bookingStep4PaymentStarted() {
    logEvent({ name: "booking_step_4_payment_started", payload: {} });
  },
  bookingCompleted(payload?: { bookingId?: string; receiptToken?: string }) {
    const p: { booking_id?: string; receipt_token?: string } = {};
    if (payload?.bookingId) p.booking_id = payload.bookingId;
    if (payload?.receiptToken) p.receipt_token = payload.receiptToken;
    logEvent({ name: "booking_completed", payload: p });
  },
};
