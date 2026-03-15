/**
 * Paths that do not require admin auth (login page, session create/check, logout).
 * Used by middleware and tests.
 */
export const ADMIN_PUBLIC_PATHS = ["/admin/login", "/api/admin/session", "/api/admin/logout"] as const;

export function isAdminPublicPath(pathname: string): boolean {
  return ADMIN_PUBLIC_PATHS.some((p) => pathname === p);
}
