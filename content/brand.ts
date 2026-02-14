/**
 * Brand content – logo path, contact, socials.
 * TODO: Swap to CMS (Sanity/Contentful) for admin-editable copy.
 */

export const brand = {
  /** Logo on light backgrounds (header desktop) */
  logoPath: "/logos/BB_Horizontal_Logo_MidTeal_NoBkg.png",
  /** Main logo dark teal – desktop navbar (teal bar) */
  logoDesktopPath: "/logos/BB_Horizontal_Logo_DarkTeal_NoBkg.png",
  /** Logo on mobile header (teal bar) – pink monogram */
  logoMonogramPath: "/logos/BB_Monogram_Pink_NoBkg@3x.png",
  /** Navbar logo – same for mobile and desktop (BB pink button icon) */
  logoNavbarPath: "/logos/BB pink Button Icon.png",
  /** Legacy: horizontal pink logo */
  logoPinkPath: "/logos/BB_Horizontal_Logo_Pink_NoBkg.png",
  /** Logo on dark backgrounds (e.g. dark hero/footer) */
  logoDarkPath: "/logos/BB_Horizontal_Logo_White_NoBkg.png",
  /** Hero section – white logo (mobile + desktop) */
  logoHeroPath: "/logos/Hero Logo white.png",
  logoAlt: "Boat Bros ATX",
  companyName: "Boat Bros ATX",
  tagline: "Captained charters for lake days & celebrations — check availability & book online now.",
  phone: "+1 (512) 555-0123",
  phoneTel: "+15125550123",
  email: "hello@boatbrosatx.com",
  address: {
    line1: "123 Marina Dr",
    city: "Austin",
    state: "TX",
    zip: "78734",
  },
  hours: "Daily 8am – sunset (seasonal)",
  socials: {
    instagram: "https://instagram.com/boatbrosatx",
    facebook: "https://facebook.com/boatbrosatx",
  },
};

export type Brand = typeof brand;
