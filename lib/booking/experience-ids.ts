/**
 * Stable Firestore experience slugs for Nasty Sport Fishing.
 *
 * These IDs originated in the Boat Bros codebase clone. They are intentional
 * implementation details — DO NOT rename Firestore documents. Customers see
 * "Nasty Half Day" / "Nasty Full Day" via titles and public URL aliases.
 */

/** Firestore `experiences.slug` for Nasty Half Day. */
export const NASTY_HALF_DAY_EXPERIENCE_SLUG = "pontoon" as const;

/** Firestore `experiences.slug` for Nasty Full Day. */
export const NASTY_FULL_DAY_EXPERIENCE_SLUG = "watersports" as const;

/** Public canonical page slug for Half Day. */
export const NASTY_HALF_DAY_PAGE_SLUG = "nasty-half-day" as const;

/** Public canonical page slug for Full Day. */
export const NASTY_FULL_DAY_PAGE_SLUG = "nasty-full-day" as const;
