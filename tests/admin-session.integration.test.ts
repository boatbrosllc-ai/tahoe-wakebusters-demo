/**
 * Integration tests for admin session: middleware allows unauthenticated access to
 * GET/POST /api/admin/session so users can log in from a no-cookie state and receive
 * a valid admin session cookie after successful auth.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { ADMIN_PUBLIC_PATHS, isAdminPublicPath } from "../lib/admin-public-paths";

describe("admin session unauthenticated access", () => {
  it("middleware allows /api/admin/session without auth (GET and POST)", () => {
    assert.ok(
      isAdminPublicPath("/api/admin/session"),
      "Middleware must allow GET/POST /api/admin/session without auth so user can log in from no-cookie state"
    );
  });

  it("middleware allows /admin/login without auth", () => {
    assert.ok(isAdminPublicPath("/admin/login"), "Login page must be publicly accessible");
  });

  it("middleware allows /api/admin/logout without auth", () => {
    assert.ok(
      isAdminPublicPath("/api/admin/logout"),
      "/api/admin/logout must be publicly accessible so users can clear session when Firebase is unavailable"
    );
  });

  it("session path is exact match so other admin routes remain protected", () => {
    assert.strictEqual(ADMIN_PUBLIC_PATHS.some((p) => p === "/api/admin/session"), true);
    assert.strictEqual(isAdminPublicPath("/api/admin/session/extra"), false);
    assert.strictEqual(isAdminPublicPath("/api/admin/bookings"), false);
  });

  it("trailing slash on public paths is still treated as public (middleware pathname variants)", () => {
    assert.ok(isAdminPublicPath("/api/admin/session/"));
    assert.ok(isAdminPublicPath("/admin/login/"));
    assert.ok(isAdminPublicPath("/api/admin/logout/"));
  });
});
