/**
 * Single customer configuration for this Slipstack deployment.
 *
 * Clone this repo per customer and edit this file (plus logos under /public/brand
 * and secrets in environment variables). Do not add a multi-site SITE_IDS switcher.
 *
 * A future Slipstack.io launch packet should overwrite these values — do not
 * silently serve this placeholder identity in a real production deploy.
 */

import type { SiteConfig } from "@/config/site-types";
import {
  assertCustomerConfigForDeploy,
  requireProductionSiteUrl,
} from "@/config/assert-production-config";

export type { SiteConfig } from "@/config/site-types";
export { TEMPLATE_PLACEHOLDER } from "@/config/site-types";

export const siteConfig: SiteConfig = {
  tenantId: "customer",
  environment: "development",

  company: {
    name: "Boat Rental Company",
    shortName: "Boat Rentals",
    legalName: "Boat Rental Company",
    publicName: "Boat Rental Company",
    tagline: "Private boat rentals — book your trip online.",
    domain: "example.com",
  },

  contact: {
    email: "info@example.com",
    phone: "",
    phoneTel: "",
    sms: "",
    address: {
      line1: "",
      city: "Your City",
      state: "",
      zip: "",
      country: "US",
    },
    hours: "",
    marinaMeetNote: "We'll send dock and check-in details after you book.",
    hoursNote: "Trips depart by reservation. We'll confirm meet-up time when you book.",
    googleMapsPlaceUrl: "",
    mapEmbedSrc: "",
    geo: null,
    areaServed: ["Your local waterways"],
  },

  branding: {
    logo: "/brand/logo.svg",
    logoDesktop: "/brand/logo-light.svg",
    logoMonogram: "/brand/logo-light.svg",
    logoNavbar: "/brand/logo-light.svg",
    logoHover: "/brand/logo-light.svg",
    logoDark: "/brand/logo-light.svg",
    logoEmail: "/brand/logo.svg",
    logoHero: "/brand/logo-light.svg",
    logoHeroHover: "/brand/logo-light.svg",
    logoAlt: "Boat Rental Company",
    favicon: "/brand/logo.svg",
  },

  theme: {
    primaryColor: "#14b6dc",
    secondaryColor: "#f27a0a",
    accentColor: "#f27a0a",
    darkColor: "#04244a",
    mutedColor: "#1a5a7a",
    backgroundColor: "#e8f6fa",
    textColor: "#04244a",
    silverColor: "#d5dbe1",
    borderRadius: "1rem",
    fontDisplay: "Syne",
  },

  social: {
    instagram: "",
    facebook: "",
    youtube: "",
    tiktok: "",
    yelp: "",
    tripadvisor: "",
  },

  seo: {
    title: "Boat Rental Company",
    description: "Private boat rentals. Book your trip online.",
    defaultOgImage: "/photos/stock/charter/fishing-boat-sunset.jpg",
    defaultOgImageAlt: "Boat rental — Boat Rental Company",
    keywords: ["boat rentals", "boat charter", "book a boat"],
    blogName: "Blog",
  },

  media: {
    hero: "/photos/stock/charter/fishing-boat-sunset.jpg",
    welcome: "/photos/stock/charter/yachts-at-dock.jpg",
    boats: "/photos/stock/charter/yacht-sailing-cabo-pexels.jpg",
    galleryFallback: "/photos/stock/charter/blue-fishing-boat-ocean-pexels.jpg",
    listingFallback: "/photos/stock/charter/yachts-at-dock.jpg",
  },

  catalog: {
    halfDay: {
      title: "Half Day",
      durationLabel: "5 Hours",
      ctaLabel: "Book Half Day",
    },
    fullDay: {
      title: "Full Day",
      durationLabel: "8 Hours",
      ctaLabel: "Book Full Day",
    },
    allIn: {
      title: "All-In",
      ctaLabel: "Book All-In",
    },
  },

  nav: {
    blogLabel: "Blog",
    experiencesLabel: "Trips",
    packagesLabel: "Packages",
    boatLabel: "Our Boat",
  },

  business: {
    timezone: "America/New_York",
    currency: "USD",
    country: "US",
    locale: "en-US",
    taxRate: 0,
    legal: {
      governingLaw: "the applicable state",
      venue: "the applicable jurisdiction",
    },
  },

  booking: {
    path: "/booking",
    mode: "link",
    providerUrl: "",
    embedSrc: "",
    depositFraction: 0.5,
    minimumNoticeHours: 48,
    slotSelectionMode: "hourly",
    cancellation: {
      freeCancelDays: 30,
      partialRefundDaysStart: 15,
      partialRefundDaysEnd: 30,
      noRefundWithinDays: 14,
      fullText:
        "Free cancellations until 30 days before the booking start time. " +
        "50% refund for cancellations between 15–30 days before the booking start time. " +
        "Cancellations within 14 days of the booking start time are non-refundable. " +
        "No-shows will be charged the full price. " +
        "You will receive a full refund or credit if we cancel due to weather or other unforeseen circumstances. " +
        "Contact us by phone to cancel or inquire about a cancellation.",
      summary:
        "Free cancel until 30 days before · 50% refund 15–30 days · No refund within 14 days · No-shows charged in full. Contact us by phone to cancel.",
    },
  },

  operations: {
    operatingHours: {
      startHour: 7,
      endHour: 19,
      firstDepartureHour: 7,
      lastDepartureHour: 19,
    },
  },

  features: {
    googleAuth: true,
    paypal: false,
    giftCards: false,
    smsReminders: false,
  },

  phone: "",
  phoneTel: "",
  sms: "",
};

assertCustomerConfigForDeploy(siteConfig);

/** Public site origin. Production requires NEXT_PUBLIC_SITE_URL or APP_BASE_URL. */
export function getSiteBaseUrl(): string {
  const fromEnv = requireProductionSiteUrl();
  if (fromEnv) return fromEnv;
  return `https://${siteConfig.company.domain}`.replace(/\/+$/, "");
}

export function getNoreplyEmail(): string {
  return process.env.BREVO_SENDER_EMAIL?.trim() || `noreply@${siteConfig.company.domain}`;
}

export function getSenderName(): string {
  return process.env.BREVO_SENDER_NAME?.trim() || siteConfig.company.name;
}

export function getContactEmail(): string {
  return process.env.CONTACT_EMAIL?.trim() || siteConfig.contact.email;
}

export function emailSubjectSuffix(): string {
  return ` – ${siteConfig.company.name}`;
}

/** Dev identity bar. Off in production unless explicitly enabled. */
export function isPlatformDevBannerEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_SHOW_PLATFORM_BANNER === "0") return false;
  if (process.env.NEXT_PUBLIC_SHOW_PLATFORM_BANNER === "1") return true;
  return process.env.NODE_ENV !== "production";
}

/** Inline CSS variables so Tailwind `brand.*` tokens follow this customer theme. */
export function siteThemeCssVars(): Record<string, string> {
  const t = siteConfig.theme;
  return {
    "--brand-primary": t.primaryColor,
    "--brand-secondary": t.secondaryColor,
    "--brand-accent": t.accentColor,
    "--brand-dark": t.darkColor,
    "--brand-muted": t.mutedColor,
    "--brand-bg": t.backgroundColor,
    "--brand-text": t.textColor,
    "--brand-silver": t.silverColor,
    "--brand-radius": t.borderRadius,
  };
}
