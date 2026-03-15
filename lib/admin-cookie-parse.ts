/**
 * Parse admin_session cookie value from a Cookie header.
 * Uses a regex that requires the name at start of string or after "; " so "xadmin_session=..." is not matched.
 * No Firebase or server-only deps so it can be unit-tested.
 */
const COOKIE_REGEX = /(?:^|;\s*)admin_session=([^;]+)/;

export function extractAdminSessionCookieValue(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(COOKIE_REGEX);
  const value = match?.[1]?.trim();
  return value ?? null;
}
