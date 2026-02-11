/**
 * Single configuration for phone, booking provider, and brand.
 * TODO: Later plug in env vars or admin/CMS for phone, booking URLs, mode.
 */

export const siteConfig = {
  /** Primary phone number – used for click-to-call and display */
  phone: "+1 (512) 555-0123",
  /** E.164 for tel: links */
  phoneTel: "+15125550123",
  /** Optional SMS number (same as phone if not set) */
  sms: "+15125550123",

  /** Booking: use custom flow at /booking */
  booking: {
    /** Path to the main booking page (custom calendar + Stripe checkout) */
    path: "/booking",
    /** "embed" = show iframe; "link" = show deep link button(s) — used on /book if you keep it */
    mode: "link" as "embed" | "link",
    /** Legacy / external URL (e.g. FareHarbor); unused when path is /booking */
    providerUrl: "https://example.com/boat-bros-booking",
    /** Optional: direct embed iframe src when mode === "embed" */
    embedSrc: "",
  },

  /** Brand colors (CSS vars are in globals.css; here for reference / future CMS) */
  brand: {
    primary: "#50bdba",
    secondary: "#fe3f93",
    dark: "#001c30",
    muted: "#196a87",
    bg: "#f0fafb",
  },
};

export type SiteConfig = typeof siteConfig;
