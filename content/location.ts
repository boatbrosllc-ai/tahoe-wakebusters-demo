/**
 * Location / Contact page and LocalBusiness schema data.
 * Sourced from Google Business Profile (GBP). No Google API keys used.
 */

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://boatbrosatx.com";

export const location = {
  /** Display name */
  name: "Boat Bros",
  /** Legal name for schema */
  legalName: "Boat Bros LLC",
  address: {
    line1: "5019 N Capital of Texas Hwy",
    city: "Austin",
    state: "TX",
    zip: "78746",
  },
  /** Formatted single line */
  addressFormatted: "5019 N Capital of Texas Hwy, Austin, TX 78746",
  phone: "(512) 957-6197",
  phoneTel: "+15129576197",
  /** GBP shows "Open 24 hours" – we show hours vary by reservation for trust */
  hoursNote: "Hours vary by reservation. We'll confirm meet-up time when you book.",
  /** Google Maps place URL for "Get Directions" (same as GBP / maps place page) */
  googleMapsPlaceUrl:
    "https://www.google.com/maps/place/Boat+Bros/@30.3485371,-97.7974601,17z/data=!3m1!4b1!4m6!3m5!1s0x865b354d3b4e2ff1:0x55e76ed5c8e9b4d2!8m2!3d30.3485371!4d-97.7974601!16s%2Fg%2F11svtlbm_x?entry=ttu",
  /**
   * iframe embed URL — Boat Bros place (no API key).
   * Place ref 0x865b354d3b4e2ff1:0x55e76ed5c8e9b4d2, coords 30.3485371,-97.7974601.
   */
  mapEmbedSrc:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d431.98!2d-97.7974601!3d30.3485371!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x865b354d3b4e2ff1%3A0x55e76ed5c8e9b4d2!2sBoat+Bros!5e0!3m2!1sen!2sus",
  /** Coordinates for schema (Boat Bros place) */
  geo: { latitude: 30.3485371, longitude: -97.7974601 },
  /** Service area for schema and content */
  areaServed: ["Austin, TX", "Lake Austin", "Mueller", "Downtown Austin", "Westlake", "Tarrytown", "The Domain", "Austin metro"],
  /** Rating/review count from GBP – for display only; no fake schema */
  rating: 5.0,
  reviewCount: 470,
  /** Same as brand for consistency */
  sameAs: [
    "https://www.instagram.com/boatbrosatx/",
    "https://www.facebook.com/p/Boat-Bros-100094413895091/",
    "https://www.yelp.com/biz/boat-bros-austin",
    "https://www.tripadvisor.com/Attraction_Review-g30196-d33273443-Reviews-Boat_Bros-Austin_Texas.html",
  ],
  url: baseUrl,
};

export type Location = typeof location;

/** Customer-facing review count, e.g. "470+ 5-star reviews". */
export function reviewCountLabel(): string {
  return `${location.reviewCount}+ 5-star reviews`;
}

/** Star rating + review count for compact trust lines, e.g. "5 · 470+ 5-star reviews". */
export function ratingWithReviewCount(): string {
  return `${location.rating} · ${reviewCountLabel()}`;
}

/** Schema.org AggregateRating object for LocalBusiness JSON-LD. */
export function locationAggregateRating() {
  return {
    "@type": "AggregateRating" as const,
    ratingValue: location.rating,
    reviewCount: location.reviewCount,
    bestRating: 5,
    worstRating: 1,
  };
}
