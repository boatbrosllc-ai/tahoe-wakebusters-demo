/**
 * Location / Contact page data.
 * City/region are public; phone, street, ZIP, geo, hours stay empty until verified.
 */

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nastysportfishing.com";

export const location = {
  /** Display name */
  name: "Nasty Sport Fishing",
  /** Legal name for schema */
  legalName: "Nasty Sport Fishing",
  address: {
    line1: "",
    city: "Cabo San Lucas",
    state: "Baja California Sur",
    zip: "",
  },
  /** Area label for UI (not a street NAP). */
  addressFormatted: "Cabo San Lucas, Baja California Sur, Mexico",
  /** Meet-up area note — slip details after booking. */
  marinaMeetNote:
    "Meet at Marina Cabo San Lucas — exact slip and check-in details arrive after booking.",
  /** Empty until verified public phone. */
  phone: "",
  phoneTel: "",
  hoursNote: "Trips depart by reservation. We'll confirm meet-up time at the marina when you book.",
  /** Maps — omit embeds/geo from schema until GBP/exact place verified. Kept optional for UI. */
  googleMapsPlaceUrl: "",
  mapEmbedSrc: "",
  geo: null as { latitude: number; longitude: number } | null,
  /** Service area for content */
  areaServed: [
    "Cabo San Lucas",
    "Los Cabos",
    "Sea of Cortez",
    "Pacific Ocean off Cabo",
  ],
  /** No public review aggregate until real reviews exist */
  rating: 0,
  reviewCount: 0,
  sameAs: [] as string[],
  url: baseUrl,
};

export type Location = typeof location;

/** Customer-facing review count, e.g. "120+ 5-star reviews". */
export function reviewCountLabel(): string {
  if (location.reviewCount <= 0) return "New Cabo charter";
  return `${location.reviewCount}+ 5-star reviews`;
}

/** Star rating + review count for compact trust lines. */
export function ratingWithReviewCount(): string {
  if (location.reviewCount <= 0) return "Cabo San Lucas sport fishing";
  return `${location.rating} · ${reviewCountLabel()}`;
}

/** Schema.org AggregateRating object for LocalBusiness JSON-LD. Omit when no reviews. */
export function locationAggregateRating() {
  if (location.reviewCount <= 0) return undefined;
  return {
    "@type": "AggregateRating" as const,
    ratingValue: location.rating,
    reviewCount: location.reviewCount,
    bestRating: 5,
    worstRating: 1,
  };
}
