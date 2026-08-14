/**
 * Brand content — derived from the active site (`config/site.ts` → `sites/<id>/config.ts`).
 * Edit identity, logos, and contact in that customer's config; do not hardcode names in components.
 */

import { siteConfig } from "@/config/site";

const { branding, company, contact, business, social } = siteConfig;

export const brand = {
  /** Logo on light backgrounds (header desktop) — colored lockup */
  logoPath: branding.logo,
  /** Main logo – desktop navbar */
  logoDesktopPath: branding.logoDesktop,
  /** Logo on mobile header */
  logoMonogramPath: branding.logoMonogram,
  /** Navbar logo – mobile and desktop */
  logoNavbarPath: branding.logoNavbar,
  /** Accent / hover logo */
  logoPinkPath: branding.logoHover,
  /** Logo on dark backgrounds (footer) */
  logoDarkPath: branding.logoDark,
  /** All transactional emails — keep colored for light email clients */
  logoEmailPath: branding.logoEmail,
  /** Hero section – primary lockup */
  logoHeroPath: branding.logoHero,
  /** Hero logo hover */
  logoHeroHoverPath: branding.logoHeroHover,
  logoAlt: branding.logoAlt,
  companyName: company.name,
  publicName: company.publicName,
  shortName: company.shortName,
  tagline: company.tagline,
  /** Business / departure timezone for new listings (seed). */
  timezone: business.timezone,
  currency: business.currency,
  country: business.country,
  locale: business.locale,
  domain: company.domain,
  /**
   * Public phone — empty until verified.
   * Do not use 555 placeholders; UI/schema omit phone when blank.
   */
  phone: contact.phone || siteConfig.phone,
  phoneTel: contact.phoneTel || siteConfig.phoneTel,
  email: contact.email,
  address: {
    line1: contact.address.line1,
    city: contact.address.city,
    state: contact.address.state,
    zip: contact.address.zip,
    country: contact.address.country,
  },
  /** Customer meet-up note (not schema streetAddress). */
  marinaMeetNote: contact.marinaMeetNote,
  /** Public hours string — empty until verified (trips by reservation). */
  hours: contact.hours,
  socials: {
    instagram: social.instagram,
    facebook: social.facebook,
    youtube: social.youtube,
    tiktok: social.tiktok,
    yelp: social.yelp,
    tripadvisor: social.tripadvisor,
  },
  catalog: siteConfig.catalog,
  media: siteConfig.media,
};

export type Brand = typeof brand;
