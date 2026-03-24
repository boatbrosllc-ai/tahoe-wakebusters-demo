/**
 * Live-price checkout guard when hold snapshot line items cannot be built.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { assertLiveAddonPricesMatchHoldSnapshot } from "../stripe-client";
import type { Hold } from "../types";
import type { ExperienceAddon } from "../types";

describe("assertLiveAddonPricesMatchHoldSnapshot", () => {
  it("ok when snapshot unit price matches live addon price", () => {
    const hold = {
      addonSelections: [{ addonId: "a1", qty: 1, priceCents: 1000 }],
    } as Hold;
    const addons = [{ addon: { name: "A", priceCents: 1000, type: "quantity", active: true } as ExperienceAddon, qty: 1 }];
    assert.strictEqual(assertLiveAddonPricesMatchHoldSnapshot(hold, addons).ok, true);
  });

  it("fails when hold addon row count does not match live pricing rows", () => {
    const hold = {
      addonSelections: [
        { addonId: "a1", qty: 1, priceCents: 1000 },
        { addonId: "a2", qty: 1, priceCents: 500 },
      ],
    } as Hold;
    const addons = [{ addon: { name: "A", priceCents: 1000, type: "quantity", active: true } as ExperienceAddon, qty: 1 }];
    const r = assertLiveAddonPricesMatchHoldSnapshot(hold, addons);
    assert.strictEqual(r.ok, false);
    if (!r.ok) {
      assert.strictEqual(r.addonId, "count_mismatch");
      assert.strictEqual(r.snapshotCents, 2);
      assert.strictEqual(r.liveCents, 1);
    }
  });

  it("fails when live Firestore price differs from hold snapshot", () => {
    const hold = {
      addonSelections: [{ addonId: "a1", qty: 1, priceCents: 1000 }],
    } as Hold;
    const addons = [{ addon: { name: "A", priceCents: 2500, type: "quantity", active: true } as ExperienceAddon, qty: 1 }];
    const r = assertLiveAddonPricesMatchHoldSnapshot(hold, addons);
    assert.strictEqual(r.ok, false);
    if (!r.ok) {
      assert.strictEqual(r.addonId, "a1");
      assert.strictEqual(r.snapshotCents, 1000);
      assert.strictEqual(r.liveCents, 2500);
    }
  });
});
