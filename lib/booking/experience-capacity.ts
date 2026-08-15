import { siteConfig } from "@/config/site";

/** Fallback when experience/boat caps are missing. */
const MAX_GUESTS = 14;

function isFixedCharterWindowsMode(): boolean {
  return siteConfig.booking.slotSelectionMode === "fixed-windows";
}

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
 * In fixed-windows mode only, wake/watersports charter is capped at 14 for legacy sportfisher inventory.
 */
export function getMaxGuestsForExperience(
  experience: {
    slug?: string;
    title?: string;
    maxGuests?: number;
    pricingType?: "charter" | "ticketed";
    maxCapacity?: number;
  },
  boatCapacityMax?: number | null,
): number {
  let cap: number;
  if (experience.pricingType === "ticketed" && experience.maxCapacity != null && experience.maxCapacity > 0) {
    cap = experience.maxCapacity;
  } else {
    const slug = (experience.slug ?? "").trim();
    const title = (experience.title ?? "").toLowerCase();
    const isCharter = experience.pricingType !== "ticketed";
    if (
      isCharter &&
      isFixedCharterWindowsMode() &&
      (isWatersportsSlug(slug) || /wake|surf|watersport|wakeboard|tube/.test(title))
    ) {
      cap = MAX_GUESTS;
    } else if (experience.maxGuests != null && experience.maxGuests > 0) {
      cap = experience.maxGuests;
    } else {
      cap = MAX_GUESTS;
    }
  }
  if (typeof boatCapacityMax === "number" && boatCapacityMax > 0) {
    cap = Math.min(cap, boatCapacityMax);
  }
  return cap;
}
