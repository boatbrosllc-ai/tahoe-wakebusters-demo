import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import { parseGoogleTagId } from "@/lib/ga-tag-id";
import { getGaMeasurementId } from "@/lib/ga-measurement-id";
import { collectProductionGa4Missing } from "../../scripts/check-production-env.js";

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
};

afterEach(() => {
  if (ORIGINAL_ENV.NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
  }
  if (ORIGINAL_ENV.NEXT_PUBLIC_GA_MEASUREMENT_ID === undefined) {
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  } else {
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = ORIGINAL_ENV.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  }
});

describe("parseGoogleTagId", () => {
  it("accepts valid Google tag ID families and normalizes case", () => {
    assert.deepStrictEqual(parseGoogleTagId("g-1qm1e4c1bb").kind, "valid");
    assert.deepStrictEqual(parseGoogleTagId("GT-abcd1234").kind, "valid");
    assert.deepStrictEqual(parseGoogleTagId("aw-123456789").kind, "valid");
    assert.deepStrictEqual(parseGoogleTagId("dc-ab12cd34").kind, "valid");
    assert.strictEqual(parseGoogleTagId("dc-ab12cd34").normalized, "DC-AB12CD34");
  });

  it("handles disabled, empty, and quote-wrapped values", () => {
    assert.strictEqual(parseGoogleTagId("off").kind, "disabled");
    assert.strictEqual(parseGoogleTagId("0").kind, "disabled");
    assert.strictEqual(parseGoogleTagId("   ").kind, "empty");
    assert.strictEqual(parseGoogleTagId("'\"g-1qm1e4c1bb\"'").normalized, "G-1QM1E4C1BB");
  });

  it("rejects malformed values", () => {
    assert.strictEqual(parseGoogleTagId("not-an-id").kind, "malformed");
    assert.strictEqual(parseGoogleTagId("G-").kind, "malformed");
    assert.strictEqual(parseGoogleTagId("UA-12345-1").kind, "malformed");
  });
});

describe("runtime and build-time GA validation alignment", () => {
  it("accepts the same valid IDs in production", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "gt-abcd1234";
    assert.strictEqual(getGaMeasurementId(), "GT-ABCD1234");
    assert.deepStrictEqual(collectProductionGa4Missing(), []);
  });

  it("treats disabled values as invalid for production in both paths", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "off";
    assert.strictEqual(getGaMeasurementId(), null);
    assert.ok(collectProductionGa4Missing().length > 0);
  });

  it("treats malformed values as invalid for production in both paths", () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "bad-value";
    assert.strictEqual(getGaMeasurementId(), null);
    assert.ok(collectProductionGa4Missing().length > 0);
  });
});
