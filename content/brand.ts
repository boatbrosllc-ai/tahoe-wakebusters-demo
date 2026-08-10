/**
 * Brand content – logo path, contact, socials.
 * Do not invent ops facts. Leave phone / street / ZIP / hours empty until verified.
 */

export const brand = {
  /** Logo on light backgrounds (header desktop) — colored lockup */
  logoPath: "/logos/NSF_Logo.png",
  /** Main logo – desktop navbar */
  logoDesktopPath: "/logos/NSF_White.png",
  /** Logo on mobile header — NASTY wordmark only */
  logoMonogramPath: "/logos/NSF_White_Mark.png",
  /** Navbar logo – mobile and desktop (white NASTY mark on cyan bar) */
  logoNavbarPath: "/logos/NSF_White_Mark.png",
  /** Accent / hover logo */
  logoPinkPath: "/logos/NSF_White_Mark.png",
  /** Logo on dark backgrounds (footer) */
  logoDarkPath: "/logos/NSF_White.png",
  /** All transactional emails — keep colored for light email clients */
  logoEmailPath: "/logos/NSF_Logo.png",
  /** Hero section – primary lockup */
  logoHeroPath: "/logos/NSF_White.png",
  /** Hero logo hover — NASTY orange, SPORT FISHING cyan */
  logoHeroHoverPath: "/logos/NSF_Hover.png",
  logoAlt: "Nasty Sport Fishing",
  companyName: "Nasty Sport Fishing",
  publicName: "Nasty Sport Fishing",
  tagline:
    "Private Cabo San Lucas fishing charters — Half Day & Full Day with captain, crew, tackle & bait.",
  /** Business / departure timezone for new listings (seed). */
  timezone: "America/Mazatlan",
  currency: "USD",
  country: "MX",
  locale: "en-US",
  domain: "nastysportfishing.com",
  /**
   * Public phone — empty until verified.
   * Do not use 555 placeholders; UI/schema omit phone when blank.
   */
  phone: "",
  phoneTel: "",
  email: "info@nastysportfishing.com",
  address: {
    /**
     * Street / slip — empty until verified.
     * Do not put "Marina Cabo San Lucas" here as a fake streetAddress.
     */
    line1: "",
    city: "Cabo San Lucas",
    state: "Baja California Sur",
    zip: "",
    country: "Mexico",
  },
  /** Customer meet-up note (not schema streetAddress). */
  marinaMeetNote:
    "Meet at Marina Cabo San Lucas — exact slip and check-in details arrive after booking.",
  /** Public hours string — empty until verified (trips by reservation). */
  hours: "",
  socials: {
    /** Set full profile URLs when live. Empty = header shows icon placeholders only (not linked). */
    instagram: "",
    facebook: "",
    tiktok: "",
    yelp: "",
    tripadvisor: "",
  },
};

export type Brand = typeof brand;
