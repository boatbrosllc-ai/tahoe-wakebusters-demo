import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { patchSiteIds, siteIdToExportName, renderConfig } = require("../../../scripts/new-customer.mjs");

describe("new-customer script", () => {
  it("names the config export from the site id", () => {
    assert.equal(siteIdToExportName("lake-austin-boats"), "lakeAustinBoatsConfig");
  });

  it("appends SITE_IDS", () => {
    const src = 'export const SITE_IDS = ["platform-dev", "abc-boats"] as const;';
    assert.match(patchSiteIds(src, "lake-austin-boats"), /lake-austin-boats/);
  });

  it("renders a default config from a packet", () => {
    const ts = renderConfig({
      siteId: "lake-austin-boats",
      business: { guestFacingName: "Lake Austin Boats", tagline: "Lake days" },
      contact: { publicEmail: "book@example.com" },
      experiences: [{ name: "Half Day", durationMinutes: 300 }],
    });
    assert.match(ts, /export const lakeAustinBoatsConfig/);
    assert.match(ts, /Lake Austin Boats/);
  });
});
