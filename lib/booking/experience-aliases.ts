/**
 * Canonical experience/slug alias matching for boat-to-experience eligibility.
 * Used by slots, experience-detail, boats (read) and create-hold (write) so UI and API stay in sync.
 * Single source of truth for all experience families (pontoon, watersports, sunset, holiday) and URL variants.
 */

/**
 * Canonical alias map: each array is a family of slugs treated as the same experience.
 * Includes Firestore slugs and known URL/static variants so boat-resolution is identical across endpoints.
 */
export const EXPERIENCE_ALIAS_FAMILIES: readonly (readonly string[])[] = [
  ["pontoon", "lake-austin-pontoon", "pontoon-party"],
  ["watersports", "wake-surf", "lake-austin-wake-boat", "wake", "wakeboard", "wake-board"],
  ["sunset", "sunset-cruise"],
  ["holiday"],
];

const FAMILY_BY_SLUG = ((): Map<string, readonly string[]> => {
  const m = new Map<string, readonly string[]>();
  for (const family of EXPERIENCE_ALIAS_FAMILIES) {
    const normalized = family.map((s) => s.toLowerCase().trim());
    for (const s of normalized) m.set(s, normalized);
  }
  return m;
})();

function getFamilyVariants(slug: string): string[] {
  const s = (slug ?? "").toLowerCase().trim();
  if (!s) return [];
  const family = FAMILY_BY_SLUG.get(s);
  return family ? [...family] : [];
}

/**
 * Returns all experience ID variants that are considered the same experience for matching.
 * Includes the document id, the slug (if different), and all aliases for the experience family
 * (e.g. pontoon + lake-austin-pontoon + pontoon-party; watersports + wake-surf + wake; sunset + sunset-cruise; holiday).
 */
export function getExperienceIdVariants(expId: string, expSlug: string): string[] {
  const slug = (expSlug ?? "").trim();
  const variants = new Set<string>();
  variants.add(expId);
  if (slug && slug !== expId) variants.add(slug);
  const family = getFamilyVariants(slug);
  family.forEach((v) => variants.add(v));
  return Array.from(variants);
}

/**
 * Returns true if the given slug is in the watersports/wake family (used for boatType filtering).
 */
export function isWatersportsSlug(slug: string): boolean {
  const family = getFamilyVariants(slug);
  return family.length > 0 && family[0] === "watersports";
}

/**
 * Returns true if the given slug is in the pontoon family.
 */
export function isPontoonSlug(slug: string): boolean {
  const family = getFamilyVariants(slug);
  return family.length > 0 && family[0] === "pontoon";
}

/**
 * Builds the URL/static slug → canonical Firestore slug map from the alias families.
 * Used by static-slug-map so both stay aligned.
 */
export function buildStaticToFirestoreSlugMap(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const family of EXPERIENCE_ALIAS_FAMILIES) {
    const canonical = family[0].toLowerCase().trim();
    for (let i = 1; i < family.length; i++) {
      out[family[i].toLowerCase().trim()] = canonical;
    }
  }
  return out;
}

/**
 * Predicate for boatType filtering: watersports => wake only; pontoon => pontoon/tritoon or missing; others => any.
 * Use when listing boats or slots so that only eligible boat types appear (e.g. wake boats for watersports).
 */
export function allowBoatTypeForSlug(slug: string): (boatType: string | undefined) => boolean {
  const s = (slug ?? "").toLowerCase().trim();
  if (isWatersportsSlug(s)) return (bt) => bt === "wake";
  if (isPontoonSlug(s)) return (bt) => !bt || bt === "pontoon" || bt === "tritoon";
  return () => true;
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
