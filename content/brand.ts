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
  /** Pink logo – hero hover */
  logoPinkPath: "/logos/Boay Bros pink Final.png",
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
    instagram: "https://www.instagram.com/boatbrosatx/?hl=en",
    facebook: "https://www.facebook.com/p/Boat-Bros-100094413895091/",
    tiktok: "https://www.tiktok.com/@boatbrosatx",
    yelp: "https://www.yelp.com/biz/boat-bros-austin",
    tripadvisor: "https://www.tripadvisor.com/Attraction_Review-g30196-d33273443-Reviews-Boat_Bros-Austin_Texas.html",
  },
};

export type Brand = typeof brand;
