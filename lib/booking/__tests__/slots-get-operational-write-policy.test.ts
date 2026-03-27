/**
 * Policy: GET /api/booking/slots must not use fire-and-forget writeOperationalAlert (unbounded writes)
 * or sendStaffInternalEmail (customer page loads must not email staff). See route JSDoc.
 */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const routePath = join(__dirname, "../../../app/api/booking/slots/route.ts");

describe("slots GET operational side-effects policy", () => {
  it("does not call writeOperationalAlert( — only deduped writeOperationalAlertIfNewDocId", () => {
    const src = readFileSync(routePath, "utf8");
    assert.match(src, /writeOperationalAlertIfNewDocId/);
    assert.ok(!/\bwriteOperationalAlert\s*\(/.test(src), "must not call writeOperationalAlert( — use writeOperationalAlertIfNewDocId");
  });

  it("does not send staff email from the slots route", () => {
    const src = readFileSync(routePath, "utf8");
    assert.ok(!src.includes("sendStaffInternalEmail"), "slots GET must not import or call sendStaffInternalEmail");
  });
});
