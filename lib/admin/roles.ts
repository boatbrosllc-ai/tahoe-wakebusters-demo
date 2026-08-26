/**
 * Admin roles for this customer deployment.
 * Super Admin = first email in ADMIN_EMAIL (or PLATFORM_ADMIN_EMAIL).
 * Operators and captains live in Firestore `adminTeam`.
 */

export function getSuperAdminEmail(): string {
  const raw = process.env.ADMIN_EMAIL?.trim() || process.env.PLATFORM_ADMIN_EMAIL?.trim() || "";
  const first = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)[0];
  return first ?? "";
}

/** Display name for the configured Super Admin (env override optional). */
export function getSuperAdminDisplayName(): string {
  const fromEnv = process.env.ADMIN_DISPLAY_NAME?.trim();
  if (fromEnv) return fromEnv;
  return "Super Admin";
}

/** @deprecated Prefer getSuperAdminEmail() — kept for call sites that expect a constant. */
export const SUPER_ADMIN_EMAIL = ""; // resolved at runtime via getSuperAdminEmail / isSuperAdminEmail
export const SUPER_ADMIN_DISPLAY_NAME = "Super Admin";

export const ADMIN_ROLES = ["super_admin", "operator", "captain"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AdminPermission =
  | "dashboard"
  | "calendar"
  | "calendar_manage"
  | "bookings"
  | "customers"
  | "waivers"
  | "listings_read"
  | "listings"
  | "content"
  | "financials"
  | "discounts"
  | "emails"
  | "integrations"
  | "ads"
  | "audit"
  | "system"
  | "team"
  | "tools";

export type AdminPrincipal = {
  email: string;
  role: AdminRole;
  displayName: string;
};

const OPERATOR_PERMISSIONS = new Set<AdminPermission>([
  "dashboard",
  "calendar",
  "calendar_manage",
  "bookings",
  "customers",
  "waivers",
  "listings_read",
]);

const CAPTAIN_PERMISSIONS = new Set<AdminPermission>(["dashboard", "calendar"]);

export function normalizeAdminEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  const superEmail = getSuperAdminEmail();
  if (!superEmail) return false;
  return normalizeAdminEmail(email) === superEmail;
}

export function isAdminRole(value: unknown): value is AdminRole {
  return value === "super_admin" || value === "operator" || value === "captain";
}

export function isTeamInviteRole(value: unknown): value is Extract<AdminRole, "operator" | "captain"> {
  return value === "operator" || value === "captain";
}

export function roleHasPermission(role: AdminRole, permission: AdminPermission): boolean {
  if (role === "super_admin") return true;
  if (role === "captain") return CAPTAIN_PERMISSIONS.has(permission);
  return OPERATOR_PERMISSIONS.has(permission);
}

/** Where this role should land after login or a forbidden-page bounce. */
export function homePathForAdminRole(_role: AdminRole): string {
  return "/admin";
}

function normalizeAdminPath(pathname: string): string {
  if (!pathname) return "";
  const noQuery = pathname.split("?")[0] ?? "";
  if (noQuery.length > 1 && noQuery.endsWith("/")) return noQuery.slice(0, -1);
  return noQuery;
}

export function requiredPermissionForAdminPath(pathname: string, method = "GET"): AdminPermission | null {
  const p = normalizeAdminPath(pathname);
  const m = method.toUpperCase();
  if (!p.startsWith("/admin") && !p.startsWith("/api/admin")) return null;
  if (p === "/admin/login" || p === "/api/admin/session" || p === "/api/admin/logout") return null;
  if (p.startsWith("/api/admin/cron/")) return null;

  if (p === "/admin" || p === "/api/admin/dashboard") return "dashboard";

  if (p === "/admin/team" || p.startsWith("/admin/team/") || p.startsWith("/api/admin/team")) return "team";

  if (p.startsWith("/api/admin/blocks")) return "calendar_manage";
  if (p.startsWith("/admin/calendars") || p.startsWith("/api/admin/calendar-events")) {
    return "calendar";
  }
  if (p === "/api/admin/captains" || p.startsWith("/api/admin/captains/")) return "bookings";
  if (p.startsWith("/admin/bookings") || p.startsWith("/api/admin/bookings")) {
    if (p.includes("/patch-stripe-data") || p.includes("/resend-final-payment-request")) return "financials";
    return "bookings";
  }
  if (p.startsWith("/admin/customers") || p.startsWith("/api/admin/customers")) return "customers";
  if (p.startsWith("/admin/waivers") || p.startsWith("/api/admin/waiver")) return "waivers";

  if (p.startsWith("/admin/experiences") || p.startsWith("/admin/boats") || p.startsWith("/api/admin/experiences") || p.startsWith("/api/admin/boats")) {
    if (p.startsWith("/api/") && m === "GET") return "listings_read";
    return "listings";
  }
  if (p.startsWith("/api/admin/upload")) return "listings";

  if (p.startsWith("/admin/blog") || p.startsWith("/api/admin/blog")) return "content";
  if (
    p.startsWith("/admin/financials") ||
    p.startsWith("/api/admin/financials") ||
    p.startsWith("/api/admin/pending-refunds") ||
    p.startsWith("/api/admin/sync-stripe") ||
    p.startsWith("/api/admin/stripe-events")
  ) {
    return "financials";
  }
  if (p.startsWith("/admin/ads") || p.startsWith("/api/admin/ads")) return "ads";
  if (p.startsWith("/admin/discounts") || p.startsWith("/api/admin/discounts")) return "discounts";
  if (p.startsWith("/admin/emails") || p.startsWith("/api/admin/email") || p.startsWith("/api/admin/notification")) {
    return "emails";
  }
  if (p.startsWith("/admin/integrations") || p.startsWith("/api/admin/integrations")) return "integrations";
  if (p.startsWith("/admin/audit") || p.startsWith("/api/admin/audit")) return "audit";
  if (p.startsWith("/admin/system-alerts") || p.startsWith("/api/admin/operational-alerts") || p.startsWith("/api/admin/debug")) {
    return "system";
  }
  return "tools";
}

export function canAccessAdminPath(role: AdminRole, pathname: string, method = "GET"): boolean {
  const permission = requiredPermissionForAdminPath(pathname, method);
  if (!permission) return true;
  return roleHasPermission(role, permission);
}
