import {
  FULL_DAY_EXPERIENCE_SLUG,
  FULL_DAY_PAGE_SLUG,
  HALF_DAY_EXPERIENCE_SLUG,
  HALF_DAY_PAGE_SLUG,
} from "@/lib/booking/experience-ids";

/** Map a launch-packet experience slug to the Firestore `experiences.slug` value. */
export function resolveFirestoreExperienceSlug(input: {
  slug: string;
  firestoreSlug?: string;
}): string {
  const explicit = input.firestoreSlug?.trim();
  if (explicit) return explicit;
  const slug = input.slug.trim().toLowerCase();
  if (slug === HALF_DAY_PAGE_SLUG || slug === "half-day") return HALF_DAY_EXPERIENCE_SLUG;
  if (slug === FULL_DAY_PAGE_SLUG || slug === "full-day") return FULL_DAY_EXPERIENCE_SLUG;
  return slug.replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || slug;
}

/** Resolve a boat's experience slug reference to Firestore slug for lookup. */
export function resolveExperienceSlugReference(ref: string): string {
  return resolveFirestoreExperienceSlug({ slug: ref });
}
