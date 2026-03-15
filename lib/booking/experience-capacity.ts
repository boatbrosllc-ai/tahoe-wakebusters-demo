/** All boats (including wakeboard/watersports) support up to 14 people. */
const MAX_GUESTS = 14;

/** Watersports/wake family slugs — wake boat max party is always 14. */
const WATERCRAFT_SLUGS = new Set([
  "watersports", "wake-surf", "lake-austin-wake-boat", "wake", "wakeboard", "wake-board",
]);

function isWatersportsSlug(slug: string | undefined): boolean {
  if (!slug) return false;
  const s = slug.toLowerCase().trim();
  return WATERCRAFT_SLUGS.has(s) || /wake|surf|watersport|wakeboard|tube/.test(s);
}

/**
 * Returns the effective max guests/tickets for an experience.
 * Ticketed experiences use maxCapacity; charter experiences use experience maxGuests or MAX_GUESTS.
 * Wake/watersports charter is always 14 regardless of stored value.
 */
export function getMaxGuestsForExperience(experience: {
  slug?: string;
  title?: string;
  maxGuests?: number;
  pricingType?: "charter" | "ticketed";
  maxCapacity?: number;
}): number {
  if (experience.pricingType === "ticketed" && experience.maxCapacity != null && experience.maxCapacity > 0) {
    return experience.maxCapacity;
  }
  const slug = (experience.slug ?? "").trim();
  const title = (experience.title ?? "").toLowerCase();
  const isCharter = experience.pricingType !== "ticketed";
  if (isCharter && (isWatersportsSlug(slug) || /wake|surf|watersport|wakeboard|tube/.test(title))) {
    return MAX_GUESTS;
  }
  if (experience.maxGuests != null && experience.maxGuests > 0) {
    return experience.maxGuests;
  }
  return MAX_GUESTS;
}
