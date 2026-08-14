import { brand } from "@/content/brand";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SEO_SITEMAP_PATHS, SEO_FUTURE_UNPUBLISHED_PATHS } from "../paths";
import {
  buildLocalBusinessJsonLd,
  getPublicPhone,
  isPlaceholderPhone,
} from "../public-contact";

const AUSTIN_PATH_MARKERS = [
  "austin",
  "lake-austin",
  "lake-travis",
  "boat-bros",
  "boatbros",
  "wakesurf",
  "wake-boat",
  "pontoon-boat-rental",
  "party-boat",
];

const CABO_PATH_MARKERS = [
  "cabo",
  "nasty",
  "fishing-reports",
  "marlin",
  "roosterfish",
  "fish-processing",
];

describe("pre-indexation SEO safety", () => {
  it("master template ships with no customer SEO growth paths in sitemap registry", () => {
    assert.deepEqual(SEO_SITEMAP_PATHS, []);
  });

  it("excludes Austin/BoatBros path markers from sitemap registry", () => {
    for (const path of SEO_SITEMAP_PATHS) {
      const lower = path.toLowerCase();
      for (const marker of AUSTIN_PATH_MARKERS) {
        assert.equal(lower.includes(marker), false, `${path} contains ${marker}`);
      }
    }
  });

  it("excludes Cabo/Nasty marketing paths from sitemap registry", () => {
    for (const path of SEO_SITEMAP_PATHS) {
      const lower = path.toLowerCase();
      for (const marker of CABO_PATH_MARKERS) {
        assert.equal(lower.includes(marker), false, `${path} contains ${marker}`);
      }
    }
  });

  it("keeps future species/month URLs out of published sitemap list", () => {
    for (const path of SEO_FUTURE_UNPUBLISHED_PATHS) {
      assert.equal(SEO_SITEMAP_PATHS.includes(path), false, path);
    }
  });

  it("treats 555 placeholders as non-public phones", () => {
    assert.equal(isPlaceholderPhone("(555) 000-0000"), true);
    assert.equal(isPlaceholderPhone("+15550000000"), true);
    assert.equal(isPlaceholderPhone(""), true);
  });

  it("omits telephone and streetAddress from LocalBusiness when unverified", () => {
    assert.equal(getPublicPhone(), null);
    const jsonLd = buildLocalBusinessJsonLd({
      baseUrl: "https://example.com",
      description: "Boat rental charters",
    });
    assert.equal(jsonLd["@type"], "LocalBusiness");
    assert.equal(jsonLd.name, brand.companyName);
    assert.equal(jsonLd.telephone, undefined);
    assert.equal(jsonLd.openingHoursSpecification, undefined);
    assert.equal(jsonLd.sameAs, undefined);
    const address = jsonLd.address as Record<string, unknown>;
    assert.equal(address.streetAddress, undefined);
    assert.equal(address.postalCode, undefined);
    assert.equal(address.addressLocality, brand.address.city);
    assert.equal(address.addressRegion, brand.address.state);
    assert.equal(address.addressCountry, brand.country);
    assert.equal(jsonLd.url, "https://example.com");
    const catalog = jsonLd.hasOfferCatalog as { itemListElement: unknown[] };
    assert.equal(catalog.itemListElement.length, 2);
  });

  it("strips trailing slash from schema URL", () => {
    const jsonLd = buildLocalBusinessJsonLd({
      baseUrl: "https://example.com/",
      description: "test",
    });
    assert.equal(jsonLd.url, "https://example.com");
  });
});
