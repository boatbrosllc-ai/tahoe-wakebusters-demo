/**
 * Stable Firestore experience slugs for this operator.
 *
 * These IDs originated in the Boat Bros codebase clone. They are intentional
 * implementation details — DO NOT rename Firestore documents. Customers see
 * public titles and URL aliases via `lib/booking/experience-ids.ts` and content.
 */

/** Firestore `experiences.slug` for Half Day. */
export const NASTY_HALF_DAY_EXPERIENCE_SLUG = "pontoon" as const;

/** Firestore `experiences.slug` for Full Day. */
export const NASTY_FULL_DAY_EXPERIENCE_SLUG = "watersports" as const;

/** Public canonical page slug for Half Day. */
export const NASTY_HALF_DAY_PAGE_SLUG = "nasty-half-day" as const;

/** Public canonical page slug for Full Day. */
export const NASTY_FULL_DAY_PAGE_SLUG = "nasty-full-day" as const;
