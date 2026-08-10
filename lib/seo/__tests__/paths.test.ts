import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SEO_FUTURE_UNPUBLISHED_PATHS, SEO_SITEMAP_PATHS } from "../paths";

describe("SEO sitemap path registry", () => {
  it("includes core commercial and authority URLs exactly once", () => {
    const required = [
      "/cabo-san-lucas-fishing-charters",
      "/deep-sea-fishing-cabo",
      "/los-cabos-fishing-charters",
      "/cabo-fishing-charter-prices",
      "/cabo-marlin-fishing",
      "/cabo-roosterfish-fishing",
      "/cabo-fishing-calendar",
      "/best-time-to-fish-cabo",
      "/best-fishing-charters-cabo-san-lucas",
      "/cabo-fish-processing",
      "/fishing-reports",
    ];
    for (const path of required) {
      assert.ok(SEO_SITEMAP_PATHS.includes(path), `missing ${path}`);
    }
    assert.strictEqual(new Set(SEO_SITEMAP_PATHS).size, SEO_SITEMAP_PATHS.length);
  });

  it("keeps future month/species URLs out of the published sitemap list", () => {
    for (const path of SEO_FUTURE_UNPUBLISHED_PATHS) {
      assert.ok(!SEO_SITEMAP_PATHS.includes(path), `future path leaked: ${path}`);
    }
  });
});
