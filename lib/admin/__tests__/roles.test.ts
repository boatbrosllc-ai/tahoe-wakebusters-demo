import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canAccessAdminPath,
  getSuperAdminEmail,
  isSuperAdminEmail,
  normalizeAdminEmail,
  roleHasPermission,
} from "../roles";

describe("admin roles", () => {
  it("normalizes emails", () => {
    assert.equal(normalizeAdminEmail("  A@B.Com "), "a@b.com");
  });

  it("treats ADMIN_EMAIL first entry as super admin", () => {
    const prev = process.env.ADMIN_EMAIL;
    process.env.ADMIN_EMAIL = "owner@example.com, other@example.com";
    try {
      assert.equal(getSuperAdminEmail(), "owner@example.com");
      assert.equal(isSuperAdminEmail("owner@example.com"), true);
      assert.equal(isSuperAdminEmail("other@example.com"), false);
    } finally {
      if (prev == null) delete process.env.ADMIN_EMAIL;
      else process.env.ADMIN_EMAIL = prev;
    }
  });

  it("captains only get dashboard + calendar", () => {
    assert.equal(roleHasPermission("captain", "dashboard"), true);
    assert.equal(roleHasPermission("captain", "calendar"), true);
    assert.equal(roleHasPermission("captain", "financials"), false);
    assert.equal(canAccessAdminPath("captain", "/admin/financials"), false);
    assert.equal(canAccessAdminPath("captain", "/admin/calendars"), true);
  });
});
