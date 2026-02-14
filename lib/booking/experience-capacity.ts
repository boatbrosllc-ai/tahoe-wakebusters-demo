/**
 * Default max guests by experience slug when Firestore doesn't have maxGuests.
 * Pontoon: 14, Wake/Watersports: 8, Sunset: 6, Holiday: 10.
 */

const DEFAULT_MAX_GUESTS_BY_SLUG: Record<string, number> = {
  pontoon: 14,
  watersports: 8,
  sunset: 6,
  holiday: 10,
};

const FALLBACK_MAX_GUESTS = 14;

/**
 * Returns the effective max guests for an experience.
 * Uses experience.maxGuests when set, otherwise slug-based defaults so pontoon = 14, wake = 8, etc.
 */
export function getMaxGuestsForExperience(experience: {
  slug?: string;
  maxGuests?: number;
}): number {
  if (typeof experience.maxGuests === "number" && experience.maxGuests > 0) {
    return experience.maxGuests;
  }
  const slug = (experience.slug ?? "").toLowerCase();
  return DEFAULT_MAX_GUESTS_BY_SLUG[slug] ?? FALLBACK_MAX_GUESTS;
}
