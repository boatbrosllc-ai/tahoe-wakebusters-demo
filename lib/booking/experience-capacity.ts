/** All boats support up to 14 people. */
const MAX_GUESTS = 14;

/**
 * Returns the effective max guests for an experience.
 * All boats are up to 14 people.
 */
export function getMaxGuestsForExperience(_experience: {
  slug?: string;
  maxGuests?: number;
}): number {
  return MAX_GUESTS;
}
