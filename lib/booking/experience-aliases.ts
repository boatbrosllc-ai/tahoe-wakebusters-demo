/**
 * Canonical experience/slug alias matching for boat-to-experience eligibility.
 * Used by slots, experience-detail, boats (read) and create-hold (write) so UI and API stay in sync.
 * Single source of truth for all experience families (pontoon, watersports, sunset, holiday) and URL variants.
 */

/**
 * Canonical alias map: each array is a family of slugs treated as the same experience.
 * Includes Firestore slugs and known URL/static variants so boat-resolution is identical across endpoints.
 */

import { isWakeListingBoatType } from "./experience-slots";

function watersportsAllowUntypedBoatInInventory(): boolean {
  if (typeof process === "undefined") return false;
  return (
    process.env.BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT === "true" ||
    process.env.NEXT_PUBLIC_BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT === "true"
  );
}

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
 * Returns slugs to try when looking up an experience by slug (requested first, then family).
 * Use in get-experience-by-slug and /api/experiences/[slug] so "sunset" finds a doc with slug "sunset-cruise".
 */
export function getSlugLookupCandidates(slug: string): string[] {
  const s = (slug ?? "").toLowerCase().trim();
  if (!s) return [];
  const family = getFamilyVariants(s);
  if (family.length === 0) return [s];
  const ordered = [s, ...family.filter((f) => f !== s)];
  return Array.from(new Set(ordered));
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
 * Returns true if the slug is in the sunset or holiday family (ticketed experiences).
 * Use in slots API so "sunset-cruise" and "sunset" both use the ticketed branch.
 *
 * Legacy slug compatibility only: callers should prefer the Firestore `pricingType`
 * field when available. When pricingType === 'ticketed', use the ticketed
 * departure-hour default (e.g. 19) regardless of slug; use this function only when
 * pricingType is not set on the document.
 */
export function isTicketedExperienceSlug(slug: string): boolean {
  const family = getFamilyVariants(slug);
  if (family.length === 0) return false;
  const canonical = family[0];
  return canonical === "sunset" || canonical === "holiday";
}

/**
 * Matches `/api/experiences` list behavior: ticketed sunset/holiday cruises unless the experience is
 * explicitly `charter`. Use in BookingModal + slot cache flags so ticketed UI and TTL stay aligned
 * with Firestore when `pricingType` is missing or legacy.
 */
export function isTicketedExperienceForBooking(exp: {
  pricingType?: "charter" | "ticketed";
  slug?: string;
  title?: string;
  name?: string;
}): boolean {
  if (exp.pricingType === "ticketed") return true;
  if (exp.pricingType === "charter") return false;
  const slug = (exp.slug ?? "").toLowerCase();
  const title = (exp.title ?? exp.name ?? "").toLowerCase();
  if (/sunset|cruise/.test(slug) || /sunset|cruise/.test(title)) return true;
  if (/holiday|festive/.test(slug) || /holiday|festive/.test(title)) return true;
  return false;
}

/**
 * Returns true if requestedSlug matches docSlug (equal or same family).
 * Use when resolving experience from list so "sunset" matches an experience with slug "sunset-cruise".
 */
export function slugMatches(requestedSlug: string, docSlug: string): boolean {
  const r = (requestedSlug ?? "").toLowerCase().trim();
  const d = (docSlug ?? "").toLowerCase().trim();
  if (r === d) return true;
  const family = getFamilyVariants(r);
  return family.includes(d);
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
 * When slug is not in a known family (e.g. experience has no slug/title, only doc id), infer from
 * assigned boats so we never show pontoon on a wake-only listing. Use after fetching boat docs.
 * - All wake → watersports
 * - All pontoon/tritoon → pontoon
 * - Mixed or any wake present → watersports (only show wake; safe default so pontoon never appears on wake listing)
 */
export function inferSlugFromAssignedBoats(
  slugForBoatType: string,
  boatDocs: { data: () => { boatType?: string } }[]
): string {
  if (isWatersportsSlug(slugForBoatType) || isPontoonSlug(slugForBoatType)) return slugForBoatType;
  if (boatDocs.length === 0) return slugForBoatType;
  const types = new Set(
    boatDocs.map((d) => (d.data().boatType ?? "").toLowerCase().trim()).filter(Boolean)
  );
  if (types.size === 0) return slugForBoatType;
  const hasWakeLike = boatDocs.some((d) => isWakeListingBoatType(d.data().boatType));
  const hasPontoonLike = types.has("pontoon") || types.has("tritoon");
  if (hasWakeLike && !hasPontoonLike) return "watersports";
  if (!hasWakeLike && hasPontoonLike) return "pontoon";
  // Mixed or wake + pontoon: treat as watersports so we only show wake (never show pontoon on wake listing)
  if (hasWakeLike) return "watersports";
  return "pontoon";
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
      if (isWakeListingBoatType(bt)) return true;
      if (b === "") return watersportsAllowUntypedBoatInInventory();
      return false;
    };
  }
  if (isPontoonSlug(s)) return (bt) => !isWakeListingBoatType(bt);
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
