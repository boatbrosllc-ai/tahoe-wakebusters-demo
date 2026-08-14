/**
 * Stable experience slugs for this operator.
 *
 * Firestore document slugs `pontoon` / `watersports` are the template's half-day
 * and full-day inventory IDs (legacy engine keys). Public URLs are `half-day`
 * and `full-day`. Do not put a customer brand name in these constants.
 */

/** Firestore `experiences.slug` for Half Day. */
export const HALF_DAY_EXPERIENCE_SLUG = "pontoon" as const;

/** Firestore `experiences.slug` for Full Day. */
export const FULL_DAY_EXPERIENCE_SLUG = "watersports" as const;

/** Public canonical page slug for Half Day. */
export const HALF_DAY_PAGE_SLUG = "half-day" as const;

/** Public canonical page slug for Full Day. */
export const FULL_DAY_PAGE_SLUG = "full-day" as const;
