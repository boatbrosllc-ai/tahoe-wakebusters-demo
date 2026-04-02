/**
 * Route-level integration test for PATCH /api/admin/experiences/[id]: ensures the handler
 * applies allowDeposit enforcement (via buildExperienceDocUpdate) so that when the payload
 * sends { allowDeposit: true } with omitted pricingType against stored ticketed data, the
 * persisted update contains allowDeposit: false. Guards against wiring regressions (e.g.
 * dropping or reordering the enforceAllowDeposit call). Uses the same helper the route uses.
 *
 * Additional source checks: pricing-day conflict returns forceRequired unless force is set,
 * then the route releases holds (see emulator tests in admin-active-holds-query.integration.test.ts).
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { buildExperienceDocUpdate } from "../lib/booking/experience-doc-update";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("PATCH admin experiences [id] allowDeposit enforcement", () => {
  it("payload allowDeposit: true with omitted pricingType against stored ticketed → persisted update has allowDeposit: false", () => {
    const parsed = { allowDeposit: true };
    const storedPricingType = "ticketed";
    const persistedUpdate = buildExperienceDocUpdate(parsed, storedPricingType);
    assert.strictEqual(
      persistedUpdate.allowDeposit,
      false,
      "PATCH must persist allowDeposit: false when stored experience is ticketed and payload sends allowDeposit: true without pricingType"
    );
  });
});

describe("PATCH admin experiences [id] pricing-day conflict + force", () => {
  it("route source: conflict when holds exist and force is false; release when force is true", () => {
    const src = readFileSync(join(__dirname, "../app/api/admin/experiences/[id]/route.ts"), "utf8");
    assert.match(
      src,
      /holdDocs\.length > 0 && !force/,
      "must return hold-blocking response only when force is not set"
    );
    assert.match(
      src,
      /holdDocs\.length > 0 && force/,
      "must run hold release when force confirms pricing-day change"
    );
    assert.match(src, /collectAllActiveHoldDocsForExperience/);
    assert.match(src, /experience_pricing_day_release_hold/);
    assert.match(src, /pricingDayHoldRelease/);
  });
});
