/**
 * Customer configuration shape for this cloned Slipstack deployment.
 *
 * One repo = one customer. Edit `config/site.ts` (and env vars) — do not add
 * a multi-site registry or `SITE_IDS` switcher.
 */

export type SiteConfig = {
  /** Stable id for this customer deployment (launch packet / ops). Not a site switcher. */
  tenantId: string;
  environment: "development" | "staging" | "production";

  company: {
    name: string;
    shortName: string;
    legalName: string;
    publicName: string;
    tagline: string;
    domain: string;
  };

  contact: {
    email: string;
    phone: string;
    phoneTel: string;
    sms: string;
    address: {
      line1: string;
      city: string;
      state: string;
      zip: string;
      country: string;
    };
    hours: string;
    marinaMeetNote: string;
    hoursNote: string;
    googleMapsPlaceUrl: string;
    mapEmbedSrc: string;
    geo: { latitude: number; longitude: number } | null;
    areaServed: string[];
  };

  branding: {
    logo: string;
    logoDesktop: string;
    logoMonogram: string;
    logoNavbar: string;
    logoHover: string;
    logoDark: string;
    logoEmail: string;
    logoHero: string;
    logoHeroHover: string;
    logoAlt: string;
    favicon: string;
  };

  theme: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    darkColor: string;
    mutedColor: string;
    backgroundColor: string;
    textColor: string;
    silverColor: string;
    borderRadius: string;
    fontDisplay: string;
  };

  social: {
    instagram: string;
    facebook: string;
    youtube: string;
    tiktok: string;
    yelp: string;
    tripadvisor: string;
  };

  seo: {
    title: string;
    description: string;
    defaultOgImage: string;
    defaultOgImageAlt: string;
    keywords: string[];
    blogName: string;
  };

  media: {
    hero: string;
    welcome: string;
    boats: string;
    galleryFallback: string;
    listingFallback: string;
  };

  catalog: {
    halfDay: { title: string; durationLabel: string; ctaLabel: string };
    fullDay: { title: string; durationLabel: string; ctaLabel: string };
    allIn: { title: string; ctaLabel: string };
  };

  nav: {
    blogLabel: string;
    experiencesLabel: string;
    packagesLabel: string;
    boatLabel: string;
  };

  business: {
    timezone: string;
    currency: string;
    country: string;
    locale: string;
    /** Sales tax applied to subtotal (e.g. 0.0825). Template default is 0 until the customer sets it. */
    taxRate: number;
    legal: { governingLaw: string; venue: string };
  };

  booking: {
    path: string;
    mode: "embed" | "link";
    providerUrl: string;
    embedSrc: string;
    /** Fraction of total collected as deposit (e.g. 0.5). */
    depositFraction: number;
    /**
     * Hours before trip start when deposit checkout is allowed and final balance is charged.
     * Defaults to 48 when omitted.
     */
    minimumNoticeHours?: number;
    /** Minutes between consecutive trips on the same boat. */
    turnaroundMinutes?: number;
    /** When the remaining balance is collected. */
    balanceTiming?: "at_booking" | "hours_before" | "on_arrival";
    /** Hours before trip start to auto-charge balance when balanceTiming is hours_before. */
    balanceHoursBefore?: number;
    refundPolicyText?: string;
    alcoholPolicyText?: string;
    minAge?: number;
    /**
     * `hourly` — standard start-time grid (default for new customers).
     * `fixed-windows` — AM/PM/full-day fixed departures (legacy sportfishing flow).
     */
    slotSelectionMode?: "hourly" | "fixed-windows";
    cancellation: {
      freeCancelDays: number;
      partialRefundDaysStart: number;
      partialRefundDaysEnd: number;
      noRefundWithinDays: number;
      fullText: string;
      summary: string;
    };
  };

  /** Operational rules from launch packet (optional until import). */
  operations?: {
    operatingHours?: {
      startHour: number;
      endHour: number;
      firstDepartureHour?: number;
      lastDepartureHour?: number;
    };
    season?: {
      enabled: boolean;
      startMonth?: number;
      endMonth?: number;
      startDate?: string;
      endDate?: string;
    };
    fuelGratuity?: {
      fuelSurchargeCents?: number;
      fuelSurchargeLabel?: string;
      suggestedGratuityPercent?: number;
      gratuityAddonCatalogKey?: string;
      gratuityNotes?: string;
      fuelPolicy?: "included" | "extra" | "customer_pays";
      gratuityPolicy?: "included" | "optional" | "not_included" | "required";
    };
    weatherPolicyText?: string;
    safetyPolicyText?: string;
    alcoholPolicyText?: string;
    weeklySchedule?: Array<{
      weekday: number;
      closed: boolean;
      openHour: number;
      openMinute: number;
      closeHour: number;
      closeMinute: number;
    }>;
  };

  features: {
    googleAuth: boolean;
    paypal: boolean;
    giftCards: boolean;
    smsReminders: boolean;
  };

  phone: string;
  phoneTel: string;
  sms: string;
};

/** Values that mean this clone has not been filled in for a real customer. */
export const TEMPLATE_PLACEHOLDER = {
  companyName: "Boat Rental Company",
  domain: "example.com",
  email: "info@example.com",
} as const;
