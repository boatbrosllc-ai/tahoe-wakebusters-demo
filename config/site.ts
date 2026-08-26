/**
 * Tahoe Wakebusters — sales demo / preview customer config.
 * Branch: demo/tahoe-wakebusters. Not for their live domain until they buy.
 */

import type { SiteConfig } from "@/config/site-types";
import {
  assertCustomerConfigForDeploy,
  requireProductionSiteUrl,
} from "@/config/assert-production-config";
import { resolveFeatureFlags } from "@/lib/plan/entitlements";

export type { SiteConfig } from "@/config/site-types";
export { TEMPLATE_PLACEHOLDER } from "@/config/site-types";

const TEMPLATE_PLAN = "full" as const;

export const siteConfig: SiteConfig = {
  tenantId: "tahoe-wakebusters-demo",
  environment: "development",
  plan: TEMPLATE_PLAN,

  company: {
    name: "Tahoe Wakebusters",
    shortName: "Wakebusters",
    legalName: "Tahoe Wakebusters",
    publicName: "Tahoe Wakebusters",
    tagline: "Make Wakes. Create Memories.",
    domain: "tahoewakebusters.com",
  },

  contact: {
    email: "tahoewakebusters@gmail.com",
    phone: "(775) 241-4039",
    phoneTel: "+17752414039",
    sms: "+17752414039",
    address: {
      line1: "2435 Venice Drive",
      city: "South Lake Tahoe",
      state: "CA",
      zip: "96150",
      country: "US",
    },
    hours: "By reservation — summer books fast",
    marinaMeetNote:
      "Departures from Tahoe Keys Marina. Arrive 20 minutes early for parking and loading (first come, first served).",
    hoursNote: "Trips depart at your booked time. We'll confirm meet-up details after you reserve.",
    googleMapsPlaceUrl: "https://maps.google.com/?q=2435+Venice+Drive+South+Lake+Tahoe+CA+96150",
    mapEmbedSrc:
      "https://www.google.com/maps?q=2435+Venice+Drive,+South+Lake+Tahoe,+CA+96150&output=embed",
    geo: { latitude: 38.9399, longitude: -119.9772 },
    areaServed: ["South Lake Tahoe", "Lake Tahoe", "Tahoe Keys Marina", "Emerald Bay"],
  },

  branding: {
    logo: "/brand/logo.png",
    logoDesktop: "/brand/logo-light.png",
    logoMonogram: "/brand/logo-light.png",
    logoNavbar: "/brand/logo-navbar-white.png",
    logoHover: "/brand/logo-light.png",
    logoDark: "/brand/logo-dark.png",
    logoEmail: "/brand/logo.png",
    logoHero: "/brand/logo-light.png",
    logoHeroHover: "/brand/logo-light.png",
    logoAlt: "Tahoe Wakebusters",
    favicon: "/brand/logo.png",
  },

  // Matched to live tahoewakebusters.com/css/styles.css :root tokens
  theme: {
    primaryColor: "#00b4d8", // --teal (accents, Lake Tahoe, eyebrows)
    secondaryColor: "#ff6b2b", // --orange (Book Now CTAs)
    accentColor: "#0096b7", // --teal-dark
    darkColor: "#0a1628", // --navy
    mutedColor: "#7a8899", // --gray-500
    backgroundColor: "#f7f9fc", // --off-white
    textColor: "#1a2535", // --text
    silverColor: "#c8d0dd", // --gray-300
    borderRadius: "0.75rem", // --radius 12px
    fontDisplay: "Roboto Slab",
  },

  social: {
    instagram: "",
    facebook: "",
    youtube: "",
    tiktok: "",
    yelp: "https://www.yelp.com/",
    tripadvisor: "",
  },

  seo: {
    title: "South Lake Tahoe Boat Rentals | Party Barge & Wakesurf Charters",
    description:
      "Lake Tahoe boat rentals from Tahoe Keys Marina. Party barges, wakesurf boats & pontoons with captain. Gas and toys included. Groups of 2–40+. Book online.",
    defaultOgImage: "/photos/wakebusters/hero-live.jpg",
    defaultOgImageAlt:
      "Wakebusters wakesurf boat on Lake Tahoe with a guest on an inflatable swan and snow-capped Sierra peaks",
    keywords: [
      "south lake tahoe boat rentals",
      "lake tahoe boat rentals",
      "tahoe boat rentals",
      "lake tahoe boat rentals with captain",
      "lake tahoe pontoon boat rental",
      "tahoe wakeboard boat rental",
      "lake tahoe boat charters",
      "rent a boat tahoe",
      "boat hire lake tahoe",
      "lake tahoe watercraft rentals",
      "Tahoe Wakebusters",
      "Tahoe Keys Marina",
    ],
    blogName: "Lake Life",
  },

  media: {
    hero: "/photos/wakebusters/hero-slides.jpg",
    welcome: "/photos/wakebusters/founder-portrait.jpg",
    boats: "/photos/wakebusters/party-barge.jpg",
    galleryFallback: "/photos/wakebusters/gallery-1.jpg",
    listingFallback: "/photos/wakebusters/tritoon.jpg",
  },

  catalog: {
    halfDay: {
      title: "Party Barge",
      durationLabel: "4–8 Hours",
      ctaLabel: "Book Party Barge",
    },
    fullDay: {
      title: "Wakesurf Charter",
      durationLabel: "2–8 Hours",
      ctaLabel: "Book Wakesurf",
    },
    allIn: {
      title: "Luxury Tritoon",
      ctaLabel: "Book Tritoon",
    },
  },

  nav: {
    blogLabel: "Guides",
    experiencesLabel: "Fleet",
    packagesLabel: "Packages",
    boatLabel: "Our Fleet",
  },

  business: {
    timezone: "America/Los_Angeles",
    currency: "USD",
    country: "US",
    locale: "en-US",
    taxRate: 0,
    legal: {
      governingLaw: "the State of California",
      venue: "El Dorado County, California",
    },
  },

  booking: {
    path: "/booking",
    mode: "link",
    providerUrl: "",
    embedSrc: "",
    depositFraction: 0.5,
    minimumNoticeHours: 24,
    balanceHoursBefore: 48,
    slotSelectionMode: "hourly",
    cancellation: {
      freeCancelDays: 7,
      partialRefundDaysStart: 7,
      partialRefundDaysEnd: 7,
      noRefundWithinDays: 7,
      fullText:
        "Cancel up to 7 days before your charter for a full refund. " +
        "If weather does not cooperate, we will work with you on a rain check or full refund. " +
        "No-shows without prior notice are non-refundable. " +
        "Contact us by phone or email to cancel.",
      summary:
        "Full refund if you cancel 7+ days ahead · Weather rain checks available · No-shows non-refundable.",
    },
  },

  operations: {
    operatingHours: {
      startHour: 8,
      endHour: 20,
      firstDepartureHour: 8,
      lastDepartureHour: 18,
    },
  },

  features: resolveFeatureFlags(TEMPLATE_PLAN),

  phone: "(775) 241-4039",
  phoneTel: "+17752414039",
  sms: "+17752414039",
};

assertCustomerConfigForDeploy(siteConfig);

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
