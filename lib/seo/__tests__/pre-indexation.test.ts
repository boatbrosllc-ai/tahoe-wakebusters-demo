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

describe("pre-indexation SEO safety", () => {
  it("money/authority SEO paths are in the published sitemap registry", () => {
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
      assert.ok(SEO_SITEMAP_PATHS.includes(path), `missing sitemap path ${path}`);
    }
  });

  it("excludes Austin/BoatBros path markers from sitemap registry", () => {
    for (const path of SEO_SITEMAP_PATHS) {
      const lower = path.toLowerCase();
      for (const marker of AUSTIN_PATH_MARKERS) {
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
      baseUrl: "https://nastysportfishing.com",
      description: "Cabo sport fishing charters",
    });
    assert.equal(jsonLd["@type"], "LocalBusiness");
    assert.equal(jsonLd.name, "Nasty Sport Fishing");
    assert.equal(jsonLd.telephone, undefined);
    assert.equal(jsonLd.openingHoursSpecification, undefined);
    assert.equal(jsonLd.sameAs, undefined);
    const address = jsonLd.address as Record<string, unknown>;
    assert.equal(address.streetAddress, undefined);
    assert.equal(address.postalCode, undefined);
    assert.equal(address.addressLocality, "Cabo San Lucas");
    assert.equal(address.addressRegion, "Baja California Sur");
    assert.equal(address.addressCountry, "MX");
    assert.equal(jsonLd.url, "https://nastysportfishing.com");
    const catalog = jsonLd.hasOfferCatalog as { itemListElement: unknown[] };
    assert.equal(catalog.itemListElement.length, 2);
  });

  it("uses nastysportfishing.com canonical domain in schema URL", () => {
    const jsonLd = buildLocalBusinessJsonLd({
      baseUrl: "https://nastysportfishing.com/",
      description: "test",
    });
    assert.equal(jsonLd.url, "https://nastysportfishing.com");
  });
});
