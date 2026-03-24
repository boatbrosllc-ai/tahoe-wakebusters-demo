/** JSON `code` when GET /api/admin/session or requireAdminSession hits a transient Firebase verification failure (use 503, not login redirect). */
export const ADMIN_AUTH_VERIFICATION_UNAVAILABLE = "ADMIN_AUTH_VERIFICATION_UNAVAILABLE";

/** Client-safe cookie name; must match `getAdminSessionCookieName()` / server session cookie. */
export const ADMIN_SESSION_COOKIE_NAME = "admin_session";
