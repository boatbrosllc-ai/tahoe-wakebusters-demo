import type { SeoLandingPageId } from "@/lib/experience/seoLanding.data";

export interface SeoLandingMediaConfig {
  fallbackHeroImage: string;
  heroAlt: string;
  ogImage: string;
  heroBadge?: string;
  /** Homepage hero loop (pillar pages). */
  useHeroVideo?: boolean;
  heroHighlights?: string[];
}

export const SEO_LANDING_MEDIA: Record<SeoLandingPageId, SeoLandingMediaConfig> = {
  "boat-rental-austin": {
    fallbackHeroImage: "/photos/IMG_9649.webp",
    ogImage: "/photos/IMG_9649.webp",
    heroAlt: "Boat rental Austin TX — captained charter on Lake Austin with Nasty Sport Fishing",
    heroBadge: "Captain included · No license needed",
    useHeroVideo: true,
    heroHighlights: ["Lake Austin", "Pontoon · Wake · Sunset", "Licensed & insured"],
  },
  "lake-austin-boat-rentals": {
    fallbackHeroImage: "/photos/IMG_9649.webp",
    ogImage: "/photos/IMG_9649.webp",
    heroAlt: "Lake Austin boat rentals — private captained pontoon on calm water",
    heroBadge: "Lake Austin · Private charter",
  },
  "austin-party-boat-rentals": {
    fallbackHeroImage: "/photos/IMG_5116%202.webp",
    ogImage: "/photos/IMG_5116%202.webp",
    heroAlt: "Austin party boat rental — private pontoon on Lake Austin",
    heroBadge: "Party boat · Up to 14 guests",
  },
  "pontoon-boat-rental-austin": {
    fallbackHeroImage: "/photos/IMG_3160.webp",
    ogImage: "/photos/IMG_3160.webp",
    heroAlt: "Pontoon boat rental Austin — Lake Austin captained pontoon",
    heroBadge: "Pontoon · Lily pad included",
  },
  "lake-austin-party-boat-rentals": {
    fallbackHeroImage: "/photos/IMG_8614%202.webp",
    ogImage: "/photos/IMG_8614%202.webp",
    heroAlt: "Lake Austin party boat rentals — private captained pontoon",
    heroBadge: "Lake Austin party boat",
  },
  "private-boat-rental-austin": {
    fallbackHeroImage: "/photos/IMG_9649.webp",
    ogImage: "/photos/IMG_9649.webp",
    heroAlt: "Private boat rental Austin — your group only on Lake Austin",
    heroBadge: "Private charter",
  },
  "captained-boat-rental-austin": {
    fallbackHeroImage: "/photos/IMG_3160.webp",
    ogImage: "/photos/IMG_3160.webp",
    heroAlt: "Captained boat rental Austin — no license needed on Lake Austin",
    heroBadge: "Licensed captain included",
  },
  "boat-ride-austin": {
    fallbackHeroImage: "/photos/IMG_9647%202.webp",
    ogImage: "/photos/IMG_9647%202.webp",
    heroAlt: "Boat ride Austin TX — sunset and private cruises on Lake Austin",
    heroBadge: "Scenic Lake Austin",
  },
  "wakesurfing-austin": {
    fallbackHeroImage: "/photos/Thomas_2.14.1.webp",
    ogImage: "/photos/Thomas_2.14.1.webp",
    heroAlt: "Wakesurfing Austin — private wake boat charter on Lake Austin",
    heroBadge: "Beginners welcome",
  },
  "wake-boat-rental-austin": {
    fallbackHeroImage: "/photos/DSC00513%20(3).webp",
    ogImage: "/photos/DSC00513%20(3).webp",
    heroAlt: "Wake boat rental Austin — captained wake boat on Lake Austin",
    heroBadge: "Wake boat · Captain included",
  },
  "wakesurf-club-austin": {
    fallbackHeroImage: "/photos/DSC00539.webp",
    ogImage: "/photos/DSC00539.webp",
    heroAlt: "Wakesurf Club Austin — Wednesday shared wake sessions on Lake Austin",
    heroBadge: "Wednesdays · 8 spots",
  },
  "sunset-cruise-austin": {
    fallbackHeroImage: "/photos/IMG_9647%202.webp",
    ogImage: "/photos/IMG_9647%202.webp",
    heroAlt: "Sunset cruise Austin — evening boat cruise on Lake Austin",
    heroBadge: "Public & private cruises",
  },
  "lake-austin-sunset-cruise": {
    fallbackHeroImage: "/photos/DSC09319%20(4).webp",
    ogImage: "/photos/DSC09319%20(4).webp",
    heroAlt: "Lake Austin sunset cruise — golden hour on the water",
    heroBadge: "Lake Austin sunsets",
  },
  "lake-austin-vs-lake-travis-boat-rental": {
    fallbackHeroImage: "/photos/IMG_4539.webp",
    ogImage: "/photos/IMG_4539.webp",
    heroAlt: "Lake Austin vs Lake Travis for boat rentals — comparison guide",
    heroBadge: "Local guide",
  },
};

export function getSeoLandingMedia(pageId: SeoLandingPageId): SeoLandingMediaConfig {
  return SEO_LANDING_MEDIA[pageId];
}
