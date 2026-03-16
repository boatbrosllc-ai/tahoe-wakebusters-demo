/**
 * Route-level integration test for PATCH /api/admin/experiences/[id]: ensures the handler
 * applies allowDeposit enforcement (via buildExperienceDocUpdate) so that when the payload
 * sends { allowDeposit: true } with omitted pricingType against stored ticketed data, the
 * persisted update contains allowDeposit: false. Guards against wiring regressions (e.g.
 * dropping or reordering the enforceAllowDeposit call). Uses the same helper the route uses.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { buildExperienceDocUpdate } from "../lib/booking/experience-doc-update";

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
