/**
 * Add-ons that must never appear in customer booking UI.
 * Covers legacy Firestore docs that still lack `hiddenFromBookingUI: true`.
 */

const HIDDEN_ADDON_CATALOG_KEYS = new Set([
  "extra-fishing-hour",
  "offshore-run",
  "celebration-package",
  "cook-your-catch",
  "framed-catch-print",
  "fish-processing-delivery",
  "extra-ice",
  "fish-cleaning",
  "sunscreen",
]);

const HIDDEN_ADDON_NAME_RE =
  /sunscreen|extra fishing hour|offshore run|celebration package|cook your catch|framed catch|fish cleaning|extra ice/i;

export function isAddonHiddenFromBookingUI(addon: {
  catalogKey?: string | null;
  name?: string | null;
  hiddenFromBookingUI?: boolean | null;
}): boolean {
  if (addon.hiddenFromBookingUI === true) return true;
  const key = (addon.catalogKey ?? "").toLowerCase().trim();
  if (key && HIDDEN_ADDON_CATALOG_KEYS.has(key)) return true;
  if (addon.name && HIDDEN_ADDON_NAME_RE.test(addon.name)) return true;
  return false;
}
