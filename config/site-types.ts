/**
 * Shared shape for customer site configuration.
 *
 * Each folder under `sites/<id>/` exports a config that satisfies this type.
 * `config/site.ts` resolves the active site and re-exports `siteConfig` so
 * existing imports keep working.
 */

export const SITE_IDS = ["platform-dev", "abc-boats"] as const;
export type SiteId = (typeof SITE_IDS)[number];

export type SiteConfig = {
  tenantId: SiteId;
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
    taxRate: number;
    legal: { governingLaw: string; venue: string };
  };

  booking: {
    path: string;
    mode: "embed" | "link";
    providerUrl: string;
    embedSrc: string;
  };

  features: {
    googleAuth: boolean;
    paypal: boolean;
    giftCards: boolean;
    smsReminders: boolean;
    /**
     * `sites` = this customer has a folder under `sites/<tenantId>/`.
     * Firebase/Stripe accounts are per-deployment env vars, not this flag.
     */
    customerSiteLayer: "inline" | "sites";
  };

  phone: string;
  phoneTel: string;
  sms: string;
};
