import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SEO_FUTURE_UNPUBLISHED_PATHS, SEO_SITEMAP_PATHS } from "../paths";

describe("SEO sitemap path registry", () => {
  it("master template ships with an empty published sitemap list", () => {
    assert.deepEqual(SEO_SITEMAP_PATHS, []);
  });

  it("keeps future month/species URLs out of the published sitemap list", () => {
    for (const path of SEO_FUTURE_UNPUBLISHED_PATHS) {
      assert.ok(!SEO_SITEMAP_PATHS.includes(path), `future path leaked: ${path}`);
    }
  });
});
