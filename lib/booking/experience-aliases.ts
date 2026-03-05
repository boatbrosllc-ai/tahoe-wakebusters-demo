/**
 * Canonical experience/slug alias matching for boat-to-experience eligibility.
 * Used by slots, experience-detail, boats (read) and create-hold (write) so UI and API stay in sync.
 */

/**
 * Returns all experience ID variants that are considered the same experience for matching.
 * Includes the document id, the slug (if different), and for pontoon experiences both
 * "pontoon" and "lake-austin-pontoon" so boats linked by either alias are accepted.
 */
export function getExperienceIdVariants(expId: string, expSlug: string): string[] {
  const slug = (expSlug ?? "").trim();
  const variants = new Set<string>();
  variants.add(expId);
  if (slug && slug !== expId) variants.add(slug);
  if (slug === "pontoon" || slug === "lake-austin-pontoon") {
    variants.add("pontoon");
    variants.add("lake-austin-pontoon");
  }
  return Array.from(variants);
}

/**
 * Returns true if the boat is assigned to this experience (by doc id or any slug alias).
 * Use for both read paths (listing boats for an experience) and write paths (validating boatId on create-hold).
 */
export function boatMatchesExperience(
  boat: { experienceIds?: string[] },
  expId: string,
  expSlug: string
): boolean {
  const ids = boat.experienceIds;
  if (!Array.isArray(ids)) return false;
  const variants = getExperienceIdVariants(expId, expSlug);
  return variants.some((v) => ids.includes(v));
}
