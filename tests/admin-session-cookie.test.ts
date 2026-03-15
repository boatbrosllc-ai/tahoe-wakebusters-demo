/**
 * Unit tests for admin session cookie extraction.
 * Verifies that the cookie regex does not match substrings (e.g. xadmin_session)
 * and correctly extracts admin_session when it appears after "; ".
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { extractAdminSessionCookieValue } from "../lib/admin-cookie-parse";

describe("extractAdminSessionCookieValue", () => {
  it("returns null when header contains only xadmin_session=fakevalue", () => {
    const header = "xadmin_session=fakevalue";
    assert.strictEqual(extractAdminSessionCookieValue(header), null);
  });

  it("returns real when header is xadmin_session=fake; admin_session=real", () => {
    const header = "xadmin_session=fake; admin_session=real";
    assert.strictEqual(extractAdminSessionCookieValue(header), "real");
  });

  it("returns value when admin_session is first cookie", () => {
    assert.strictEqual(extractAdminSessionCookieValue("admin_session=abc"), "abc");
  });

  it("returns null for null or empty header", () => {
    assert.strictEqual(extractAdminSessionCookieValue(null), null);
    assert.strictEqual(extractAdminSessionCookieValue(""), null);
  });
});
