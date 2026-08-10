/**
 * Single configuration for phone, booking provider, and brand.
 * TODO: Plug in real NSF phone / SMS when available.
 */

export const siteConfig = {
  /** Primary phone number – used for click-to-call and display */
  phone: "(555) 000-0000",
  /** E.164 for tel: links */
  phoneTel: "+15550000000",
  /** Optional SMS number (same as phone if not set) */
  sms: "+15550000000",

  /** Booking: use custom flow at /booking */
  booking: {
    /** Path to the main booking page (custom calendar + Stripe checkout) */
    path: "/booking",
    /** "embed" = show iframe; "link" = show deep link button(s) — used on /book if you keep it */
    mode: "link" as "embed" | "link",
    /** Legacy / external URL; unused when path is /booking */
    providerUrl: "https://example.com/nasty-sport-fishing-booking",
    /** Optional: direct embed iframe src when mode === "embed" */
    embedSrc: "",
  },

  /** Brand colors (CSS vars are in globals.css; here for reference / future CMS) */
  brand: {
    primary: "#14b6dc",
    secondary: "#f27a0a",
    dark: "#04244a",
    muted: "#1a5a7a",
    bg: "#e8f6fa",
  },
};

export type SiteConfig = typeof siteConfig;
