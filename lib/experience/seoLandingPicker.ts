/** IDs that use the multi trip-type hero booking picker (keep in sync with SeoLandingPageId). */
export type SeoTripPickerPageId =
  | "boat-rental-austin"
  | "lake-austin-boat-rentals"
  | "private-boat-rental-austin"
  | "captained-boat-rental-austin"
  | "boat-ride-austin";

const SEO_PAGES_WITH_TRIP_PICKER = new Set<SeoTripPickerPageId>([
  "boat-rental-austin",
  "lake-austin-boat-rentals",
  "private-boat-rental-austin",
  "captained-boat-rental-austin",
  "boat-ride-austin",
]);

/** General/pillar intent — guest picks trip type. Experience-specific pages use a fixed booking slug. */
export function shouldShowExperiencePicker(pageId: string): boolean {
  return SEO_PAGES_WITH_TRIP_PICKER.has(pageId as SeoTripPickerPageId);
}
