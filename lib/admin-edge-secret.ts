/**
 * Shared ADMIN_EDGE_SECRET rules for Node routes and Edge middleware.
 * Must match createEdgeSessionCookie (min 32 UTF-8 bytes).
 */

export const ADMIN_EDGE_SECRET_MIN_UTF8_BYTES = 32;

/** Stable API / operator error code when the secret is missing or too short in production. */
export const ADMIN_EDGE_SECRET_CONFIG_CODE = "ADMIN_EDGE_SECRET_INVALID";

export function isAdminEdgeSecretValid(secret: string | undefined | null): boolean {
  const s = typeof secret === "string" ? secret.trim() : "";
  if (!s) return false;
  return new TextEncoder().encode(s).length >= ADMIN_EDGE_SECRET_MIN_UTF8_BYTES;
}
