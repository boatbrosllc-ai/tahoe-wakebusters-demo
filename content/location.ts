/**
 * Location / Contact page data — derived from the active site config.
 */

import { getSiteBaseUrl, siteConfig } from "@/config/site";

const { company, contact } = siteConfig;

export const location = {
  /** Display name */
  name: company.name,
  /** Legal name for schema */
  legalName: company.legalName,
  address: {
    line1: contact.address.line1,
    city: contact.address.city,
    state: contact.address.state,
    zip: contact.address.zip,
  },
  /** Area label for UI (not a street NAP). */
  addressFormatted: [contact.address.city, contact.address.state, contact.address.country]
    .filter(Boolean)
    .join(", "),
  /** Meet-up area note — slip details after booking. */
  marinaMeetNote: contact.marinaMeetNote,
  /** Empty until verified public phone. */
  phone: contact.phone || siteConfig.phone,
  phoneTel: contact.phoneTel || siteConfig.phoneTel,
  hoursNote: contact.hoursNote,
  /** Maps — omit embeds/geo from schema until GBP/exact place verified. Kept optional for UI. */
  googleMapsPlaceUrl: contact.googleMapsPlaceUrl,
  mapEmbedSrc: contact.mapEmbedSrc,
  geo: contact.geo,
  /** Service area for content */
  areaServed: [...contact.areaServed],
  /** No public review aggregate until real reviews exist */
  rating: 0,
  reviewCount: 0,
  sameAs: [] as string[],
  url: getSiteBaseUrl(),
};

export type Location = typeof location;

/** Customer-facing review count, e.g. "120+ 5-star reviews". */
export function reviewCountLabel(): string {
  if (location.reviewCount <= 0) return "New charter";
  return `${location.reviewCount}+ 5-star reviews`;
}

/** Star rating + review count for compact trust lines. */
export function ratingWithReviewCount(): string {
  if (location.reviewCount <= 0) {
    return `${location.address.city} boat rentals`;
  }
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
