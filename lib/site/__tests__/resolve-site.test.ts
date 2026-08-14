import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { abcBoatsConfig } from "@/sites/abc-boats/config";
import { platformDevConfig } from "@/sites/platform-dev/config";
import { getActiveSiteId, isSiteId, SITE_REGISTRY } from "@/config/resolve-site";

describe("customer site resolver", () => {
  it("defaults to platform-dev when no site id is set", () => {
    assert.equal(getActiveSiteId({}), "platform-dev");
  });

  it("reads SLIPSTACK_SITE_ID", () => {
    assert.equal(getActiveSiteId({ SLIPSTACK_SITE_ID: "abc-boats" }), "abc-boats");
  });

  it("reads SITE_ID as an alias", () => {
    assert.equal(getActiveSiteId({ SITE_ID: "abc-boats" }), "abc-boats");
  });

  it("prefers NEXT_PUBLIC_SLIPSTACK_SITE_ID", () => {
    assert.equal(
      getActiveSiteId({
        SLIPSTACK_SITE_ID: "platform-dev",
        NEXT_PUBLIC_SLIPSTACK_SITE_ID: "abc-boats",
      }),
      "abc-boats"
    );
  });

  it("falls back for unknown ids outside production", () => {
    assert.equal(getActiveSiteId({ SLIPSTACK_SITE_ID: "not-a-customer" }), "platform-dev");
  });

  it("throws for unknown ids in production", () => {
    assert.throws(
      () => getActiveSiteId({ NODE_ENV: "production", SLIPSTACK_SITE_ID: "not-a-customer" }),
      /Unknown or missing SLIPSTACK_SITE_ID/
    );
  });

  it("registers abc-boats as a distinct customer frontend config", () => {
    assert.equal(isSiteId("abc-boats"), true);
    assert.equal(SITE_REGISTRY["abc-boats"], abcBoatsConfig);
    assert.equal(abcBoatsConfig.company.name, "ABC Boats");
    assert.equal(abcBoatsConfig.tenantId, "abc-boats");
    assert.notEqual(abcBoatsConfig.company.name, platformDevConfig.company.name);
    assert.notEqual(abcBoatsConfig.theme.primaryColor, platformDevConfig.theme.primaryColor);
    assert.equal(abcBoatsConfig.features.customerSiteLayer, "sites");
  });
});
