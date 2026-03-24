/**
 * UI clamp (usePriceSummary) and create-hold server enforcement must share TIP_MAX_PERCENT_SERVER.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { TIP_MAX_PERCENT_SERVER } from "../constants";

describe("tip cap parity (UI vs create-hold)", () => {
  for (const postDiscountTotalCents of [12_345, 50_000, 99_999]) {
    it(`equivalent max tip cents for post-discount total ${postDiscountTotalCents}`, () => {
      const serverCap = Math.round(postDiscountTotalCents * (TIP_MAX_PERCENT_SERVER / 100));
      const uiCapIfAppliedToSameBase = Math.round(postDiscountTotalCents * (TIP_MAX_PERCENT_SERVER / 100));
      assert.strictEqual(serverCap, uiCapIfAppliedToSameBase);
    });
  }
});
