/**
 * Paths that do not require admin auth (login page, session create/check, logout).
 * Used by middleware and tests.
 */
export const ADMIN_PUBLIC_PATHS = ["/admin/login", "/api/admin/session", "/api/admin/logout"] as const;

/** Normalize pathname so trailing slashes still match public routes (middleware pathname can vary). */
function normalizePathnameForAdminPublic(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

export function isAdminPublicPath(pathname: string): boolean {
  const p = normalizePathnameForAdminPublic(pathname);
  return ADMIN_PUBLIC_PATHS.some((pub) => p === pub);
}
