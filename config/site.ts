/**
 * Single configuration for phone, booking provider, and brand.
 * Phone/SMS stay empty until a verified NSF number is available.
 */

export const siteConfig = {
  /** Primary phone — empty until verified (UI omits call CTAs). */
  phone: "",
  /** E.164 for tel: links — empty until verified. */
  phoneTel: "",
  /** Optional SMS number — empty until verified. */
  sms: "",

  /** Booking: use custom flow at /booking */
  booking: {
    /** Path to the main booking page (custom calendar + Stripe checkout) */
    path: "/booking",
    /** "embed" = show iframe; "link" = show deep link button(s) — used on /book if you keep it */
    mode: "link" as "embed" | "link",
    /** Legacy / external URL; unused when path is /booking */
    providerUrl: "",
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
