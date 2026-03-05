/**
 * Maps URL/static experience slugs to Firestore experience slugs.
 * Shared by server (book page) and client (StaticExperienceBookingSection).
 * Must stay in a non-client module so server components can use it.
 * Derived from experience-aliases so alias rules and this map stay aligned.
 */
import { buildStaticToFirestoreSlugMap } from "./experience-aliases";

export const STATIC_TO_FIRESTORE_SLUG: Record<string, string> = buildStaticToFirestoreSlugMap();
