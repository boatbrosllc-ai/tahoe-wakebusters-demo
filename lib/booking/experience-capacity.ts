/** All boats support up to 14 people. */
const MAX_GUESTS = 14;

/**
 * Returns the effective max guests/tickets for an experience.
 * Ticketed experiences use maxCapacity; charter experiences use MAX_GUESTS.
 */
export function getMaxGuestsForExperience(experience: {
  slug?: string;
  maxGuests?: number;
  pricingType?: "charter" | "ticketed";
  maxCapacity?: number;
}): number {
  if (experience.pricingType === "ticketed" && experience.maxCapacity != null && experience.maxCapacity > 0) {
    return experience.maxCapacity;
  }
  if (experience.maxGuests != null && experience.maxGuests > 0) {
    return experience.maxGuests;
  }
  return MAX_GUESTS;
}
