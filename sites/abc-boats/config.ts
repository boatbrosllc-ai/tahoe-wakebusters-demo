import type { SiteConfig } from "@/config/site-types";

/**
 * ABC Boats — fake customer used to prove the customer-site layer.
 *
 * Customize this customer's look in `sites/abc-boats/` (pages, components, styles).
 * Do not copy booking/payment/waiver/auth logic here — import shared components.
 */
export const abcBoatsConfig: SiteConfig = {
  tenantId: "abc-boats",
  environment: "development",

  company: {
    name: "ABC Boats",
    shortName: "ABC Boats",
    legalName: "ABC Boats LLC",
    publicName: "ABC Boats",
    tagline: "Lake days, done right.",
    domain: "abcboats.example",
  },

  contact: {
    email: "hello@abcboats.example",
    phone: "(555) 555-5555",
    phoneTel: "+15555555555",
    sms: "",
    address: {
      line1: "",
      city: "Lakeview",
      state: "TX",
      zip: "",
      country: "US",
    },
    hours: "",
    marinaMeetNote: "We'll text dock details after you book.",
    hoursNote: "Trips by reservation. Meet-up time is confirmed when you book.",
    googleMapsPlaceUrl: "",
    mapEmbedSrc: "",
    geo: null,
    areaServed: ["Lakeview Reservoir"],
  },

  branding: {
    logo: "/sites/abc-boats/logo.svg",
    logoDesktop: "/sites/abc-boats/logo-light.svg",
    logoMonogram: "/sites/abc-boats/logo-light.svg",
    logoNavbar: "/sites/abc-boats/logo-light.svg",
    logoHover: "/sites/abc-boats/logo-light.svg",
    logoDark: "/sites/abc-boats/logo-light.svg",
    logoEmail: "/sites/abc-boats/logo.svg",
    logoHero: "/sites/abc-boats/logo-light.svg",
    logoHeroHover: "/sites/abc-boats/logo-light.svg",
    logoAlt: "ABC Boats",
    favicon: "/sites/abc-boats/logo.svg",
  },

  theme: {
    primaryColor: "#0b1f3a",
    secondaryColor: "#c9a227",
    accentColor: "#c9a227",
    darkColor: "#071525",
    mutedColor: "#3d4f66",
    backgroundColor: "#f6f1e7",
    textColor: "#071525",
    silverColor: "#d8d0c0",
    borderRadius: "0.125rem",
    fontDisplay: "Oswald",
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
    title: "ABC Boats | Private Boat Rentals",
    description: "ABC Boats — private captained rentals. Book your lake day online.",
    defaultOgImage: "/photos/stock/charter/yachts-at-dock.jpg",
    defaultOgImageAlt: "Boats at the dock — ABC Boats",
    keywords: ["ABC Boats", "boat rentals", "lake boat rental"],
    blogName: "Journal",
  },

  media: {
    hero: "/photos/stock/charter/yachts-at-dock.jpg",
    welcome: "/photos/stock/charter/yacht-sailing-cabo-pexels.jpg",
    boats: "/photos/stock/charter/blue-fishing-boat-ocean-pexels.jpg",
    galleryFallback: "/photos/stock/charter/fishing-boat-sunset.jpg",
    listingFallback: "/photos/stock/charter/yachts-at-dock.jpg",
  },

  catalog: {
    halfDay: {
      title: "Half Day",
      durationLabel: "4 Hours",
      ctaLabel: "Book Half Day",
    },
    fullDay: {
      title: "Full Day",
      durationLabel: "8 Hours",
      ctaLabel: "Book Full Day",
    },
    allIn: {
      title: "Full Day Plus",
      ctaLabel: "Book Full Day Plus",
    },
  },

  nav: {
    blogLabel: "Journal",
    experiencesLabel: "Fleet",
    packagesLabel: "Packages",
    boatLabel: "The Boat",
  },

  business: {
    timezone: "America/Chicago",
    currency: "USD",
    country: "US",
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

  phone: "(555) 555-5555",
  phoneTel: "+15555555555",
  sms: "",
};
