/**
 * Maps URL/static experience slugs to Firestore experience slugs.
 * Shared by server (book page) and client (StaticExperienceBookingSection).
 * Must stay in a non-client module so server components can use it.
 */
export const STATIC_TO_FIRESTORE_SLUG: Record<string, string> = {
  "pontoon-party": "pontoon",
  "wake-surf": "watersports",
  "sunset-cruise": "sunset",
};
