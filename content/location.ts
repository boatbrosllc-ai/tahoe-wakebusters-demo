/**
 * Location / Contact page and LocalBusiness schema data.
 * TODO: Replace map URLs and geo with the live marina / GBP place when ready.
 */

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://nastysportfishing.com";

export const location = {
  /** Display name */
  name: "Nasty Sport Fishing",
  /** Legal name for schema */
  legalName: "Nasty Sport Fishing",
  address: {
    line1: "Marina Cabo San Lucas",
    city: "Cabo San Lucas",
    state: "BCS",
    zip: "23450",
  },
  /** Formatted single line */
  addressFormatted: "Marina Cabo San Lucas, Cabo San Lucas, BCS 23450, Mexico",
  phone: "(555) 000-0000",
  phoneTel: "+15550000000",
  hoursNote: "Hours vary by charter. We'll confirm meet-up time at the marina when you book.",
  /** Google Maps – Cabo San Lucas Marina area (update to exact slip / GBP) */
  googleMapsPlaceUrl:
    "https://www.google.com/maps/place/Marina+Cabo+San+Lucas/@22.8807,-109.9105,15z",
  /**
   * iframe embed — Marina Cabo San Lucas area (no API key).
   */
  mapEmbedSrc:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d14668.5!2d-109.9105!3d22.8807!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x86af4f0c4c8c8c8d%3A0x0!2sMarina%20Cabo%20San%20Lucas!5e0!3m2!1sen!2smx",
  /** Coordinates for schema (Cabo marina approx.) */
  geo: { latitude: 22.8807, longitude: -109.9105 },
  /** Service area for schema and content */
  areaServed: [
    "Cabo San Lucas",
    "Los Cabos",
    "Sea of Cortez",
    "Pacific Ocean off Cabo",
    "Gordo Banks",
    "Jaime Bank",
  ],
  /** Placeholder until Google reviews are live — hide fake schema claims in UI carefully */
  rating: 5.0,
  reviewCount: 0,
  sameAs: [
    "https://www.instagram.com/",
    "https://www.facebook.com/",
  ],
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
