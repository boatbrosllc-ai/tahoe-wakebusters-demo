import type { SiteConfig } from "@/config/site-types";

/**
 * Default / neutral Slipstack demo site.
 *
 * Identity for local development when SLIPSTACK_SITE_ID is unset or
 * `platform-dev`. Unique marketing layouts for real customers live in
 * sibling folders (e.g. `sites/abc-boats/`).
 */
export const platformDevConfig: SiteConfig = {
  tenantId: "platform-dev",
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
      country: "",
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
    timezone: "America/Mazatlan",
    currency: "USD",
    country: "MX",
    locale: "en-US",
    taxRate: 0.0825,
    legal: {
      governingLaw: "Texas",
      venue: "the state of Texas",
    },
  },

  booking: {
    path: "/booking",
    mode: "link",
    providerUrl: "",
    embedSrc: "",
  },

  features: {
    googleAuth: true,
    paypal: false,
    giftCards: false,
    smsReminders: false,
    customerSiteLayer: "sites",
  },

  phone: "",
  phoneTel: "",
  sms: "",
};
