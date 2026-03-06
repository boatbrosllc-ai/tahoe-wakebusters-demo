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
 * Slug to use for boat-type filtering. Prefers title-inferred slug when it indicates watersports or pontoon
 * so that wake-only / no-wake filtering applies even if the experience has a different explicit slug.
 * If the effective slug is not in any family (e.g. Firestore doc id, or slug with spaces), infer from
 * keywords so wake experiences never show pontoon/tritoon and pontoon experiences never show wake.
 * @param titleOrName - Optional experience title/name; included in keyword fallback so we never miss watersports/pontoon.
 */
export function getSlugForBoatTypeFilter(
  experienceSlug: string,
  inferredFromTitle: string,
  experienceId: string,
  titleOrName?: string
): string {
  const inferred = (inferredFromTitle ?? "").toLowerCase().trim();
  if (inferred && (isWatersportsSlug(inferred) || isPontoonSlug(inferred))) return inferred;
  const effective = (experienceSlug ?? "").trim().toLowerCase() || inferred || (experienceId ?? "").trim().toLowerCase();
  // If effective is in a known family, use it (e.g. "lake-austin-wake-boat" -> watersports family).
  if (effective && (isWatersportsSlug(effective) || isPontoonSlug(effective))) return effective;
  // Treat effective as a title-like string (e.g. "lake austin wake boat" with spaces).
  const fromEffective = inferSlugFromTitle(effective);
  if (fromEffective && (isWatersportsSlug(fromEffective) || isPontoonSlug(fromEffective))) return fromEffective;
  // Fallback: infer from slug + experienceId + title so we never treat watersports as "other".
  const raw = `${(experienceSlug ?? "").trim()} ${(experienceId ?? "").trim()} ${(titleOrName ?? "").trim()}`.toLowerCase();
  if (/wake|surf|watersport|wakeboard|tube/.test(raw)) return "watersports";
  if (/pontoon|tritoon|party/.test(raw)) return "pontoon";
  return effective;
}

/**
 * Infer a canonical slug from experience title/name (e.g. "Wake & Surf" -> "watersports").
 * Call with title/name only; use for boat-type filter so watersports/pontoon always filter correctly.
 */
export function inferSlugFromTitle(titleOrName: string | undefined): string {
  const t = (titleOrName ?? "").toLowerCase();
  if (/wake|surf|watersport|wakeboard|tube/.test(t)) return "watersports";
  if (/pontoon|tritoon|party/.test(t)) return "pontoon";
  if (/sunset|cruise/.test(t)) return "sunset";
  if (/holiday|festive/.test(t)) return "holiday";
  return "";
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
 * Predicate for boatType filtering: watersports => wake only (never show pontoon/tritoon); pontoon => any except wake; others => any.
 * Use when listing boats or slots so that only eligible boat types appear (e.g. wake boats for watersports).
 * For watersports we explicitly reject pontoon/tritoon so they never appear even if mis-assigned or slug is wrong.
 */
export function allowBoatTypeForSlug(slug: string): (boatType: string | undefined) => boolean {
  const s = (slug ?? "").toLowerCase().trim();
  if (isWatersportsSlug(s)) {
    return (bt) => {
      const b = (bt ?? "").toLowerCase().trim();
      if (b === "pontoon" || b === "tritoon") return false;
      return b === "wake";
    };
  }
  if (isPontoonSlug(s)) return (bt) => (bt ?? "").toLowerCase().trim() !== "wake";
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
