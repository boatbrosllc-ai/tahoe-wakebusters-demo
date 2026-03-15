/**
 * Boat types used by the pricing calendar (overrides by boat type + date).
 * Shared by API allowlist and admin UI so both stay in sync when new types are added.
 */
export const ALLOWED_BOAT_TYPES = new Set(["pontoon", "wake", "tritoon"]);

export function isAllowedBoatType(value: string | null | undefined): value is string {
  return typeof value === "string" && ALLOWED_BOAT_TYPES.has(value.trim().toLowerCase());
}
