/**
 * Brand content – logo path, contact, socials.
 * Single place for public company identity. Do not invent ops facts — use placeholders until confirmed.
 */

export const brand = {
  /** Logo on light backgrounds (header desktop) */
  logoPath: "/logos/NSF_Logo.png",
  /** Main logo – desktop navbar */
  logoDesktopPath: "/logos/NSF_Logo.png",
  /** Logo on mobile header */
  logoMonogramPath: "/logos/NSF_Logo.png",
  /** Navbar logo – mobile and desktop */
  logoNavbarPath: "/logos/NSF_Logo.png",
  /** Accent / hover logo */
  logoPinkPath: "/logos/NSF_Logo.png",
  /** Logo on dark backgrounds (footer) */
  logoDarkPath: "/logos/NSF_Logo.png",
  /** All transactional emails */
  logoEmailPath: "/logos/NSF_Logo.png",
  /** Hero section – primary lockup */
  logoHeroPath: "/logos/NSF_Logo.png",
  logoAlt: "Nasty Sport Fishing",
  companyName: "Nasty Sport Fishing",
  publicName: "Nasty Sport Fishing",
  tagline: "Cabo San Lucas sport fishing charters — marlin, tuna, dorado & more. Book your trip.",
  /** Business / departure timezone for new listings (seed). */
  timezone: "America/Mazatlan",
  currency: "USD",
  country: "MX",
  locale: "en-US",
  domain: "nastysportfishing.com",
  phone: "(555) 000-0000",
  phoneTel: "+15550000000",
  email: "info@nastysportfishing.com",
  address: {
    line1: "Marina Cabo San Lucas",
    city: "Cabo San Lucas",
    state: "BCS",
    zip: "23450",
    country: "Mexico",
  },
  hours: "Daily — trips depart by reservation",
  socials: {
    instagram: "https://www.instagram.com/",
    facebook: "https://www.facebook.com/",
    tiktok: "https://www.tiktok.com/",
    yelp: "https://www.yelp.com/",
    tripadvisor: "https://www.tripadvisor.com/",
  },
};

export type Brand = typeof brand;
