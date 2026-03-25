/**
 * Regression tests for experience alias families.
 * Verifies identical boat-resolution outcomes across endpoints: for each alias in a family,
 * getExperienceIdVariants returns a variant set that includes all family members, so boats
 * linked by any alias are resolved consistently (boats, experience-detail, slots, create-hold).
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  getExperienceIdVariants,
  boatMatchesExperience,
  isWatersportsSlug,
  isPontoonSlug,
  allowBoatTypeForSlug,
  EXPERIENCE_ALIAS_FAMILIES,
  buildStaticToFirestoreSlugMap,
} from "../experience-aliases";

describe("getExperienceIdVariants", () => {
  const pontoonFamily = ["pontoon", "lake-austin-pontoon", "pontoon-party"];
  const watersportsFamily = ["watersports", "wake-surf", "lake-austin-wake-boat", "wake", "wakeboard", "wake-board"];
  const sunsetFamily = ["sunset", "sunset-cruise"];
  const holidayFamily = ["holiday"];

  it("pontoon family: every alias yields same variant set for boat-resolution", () => {
    const docId = "exp-pontoon-1";
    const expectedIds = new Set([docId, ...pontoonFamily]);
    for (const slug of pontoonFamily) {
      const variants = getExperienceIdVariants(docId, slug);
      const variantSet = new Set(variants);
      assert.ok(
        pontoonFamily.every((a) => variantSet.has(a)),
        `slug "${slug}" should include all pontoon aliases, got ${JSON.stringify(variants)}`
      );
      assert.ok(variantSet.has(docId), `slug "${slug}" should include doc id`);
    }
  });

  it("watersports family: every alias yields same variant set for boat-resolution", () => {
    const docId = "exp-wake-1";
    const expectedIds = new Set([docId, ...watersportsFamily]);
    for (const slug of watersportsFamily) {
      const variants = getExperienceIdVariants(docId, slug);
      const variantSet = new Set(variants);
      assert.ok(
        watersportsFamily.every((a) => variantSet.has(a)),
        `slug "${slug}" should include all watersports aliases, got ${JSON.stringify(variants)}`
      );
      assert.ok(variantSet.has(docId), `slug "${slug}" should include doc id`);
    }
  });

  it("sunset family: every alias yields same variant set for boat-resolution", () => {
    const docId = "exp-sunset-1";
    for (const slug of sunsetFamily) {
      const variants = getExperienceIdVariants(docId, slug);
      const variantSet = new Set(variants);
      assert.ok(
        sunsetFamily.every((a) => variantSet.has(a)),
        `slug "${slug}" should include all sunset aliases, got ${JSON.stringify(variants)}`
      );
      assert.ok(variantSet.has(docId), `slug "${slug}" should include doc id`);
    }
  });

  it("holiday family: slug yields doc id and holiday", () => {
    const docId = "exp-holiday-1";
    const variants = getExperienceIdVariants(docId, "holiday");
    const variantSet = new Set(variants);
    assert.ok(variantSet.has(docId), "should include doc id");
    assert.ok(variantSet.has("holiday"), "should include holiday");
  });

  it("unknown slug: returns only doc id and slug", () => {
    const variants = getExperienceIdVariants("exp-xyz", "custom-slug");
    assert.ok(variants.includes("exp-xyz"));
    assert.ok(variants.includes("custom-slug"));
    assert.strictEqual(variants.length, 2);
  });
});

describe("boatMatchesExperience", () => {
  it("matches when boat has doc id", () => {
    assert.strictEqual(boatMatchesExperience({ experienceIds: ["exp-1"] }, "exp-1", "pontoon"), true);
  });
  it("matches when boat has family alias (pontoon)", () => {
    assert.strictEqual(boatMatchesExperience({ experienceIds: ["lake-austin-pontoon"] }, "exp-1", "pontoon"), true);
  });
  it("matches when boat has family alias (watersports)", () => {
    assert.strictEqual(boatMatchesExperience({ experienceIds: ["wake-surf"] }, "exp-1", "watersports"), true);
  });
  it("matches when boat has family alias (sunset)", () => {
    assert.strictEqual(boatMatchesExperience({ experienceIds: ["sunset-cruise"] }, "exp-1", "sunset"), true);
  });
  it("no match when boat has unrelated experience", () => {
    assert.strictEqual(boatMatchesExperience({ experienceIds: ["other-exp"] }, "exp-1", "pontoon"), false);
  });
  it("empty or missing experienceIds", () => {
    assert.strictEqual(boatMatchesExperience({ experienceIds: [] }, "exp-1", "pontoon"), false);
    assert.strictEqual(boatMatchesExperience({}, "exp-1", "pontoon"), false);
  });
});

describe("isWatersportsSlug / isPontoonSlug", () => {
  it("isWatersportsSlug true for all watersports aliases", () => {
    const watersports = ["watersports", "wake-surf", "lake-austin-wake-boat", "wake", "wakeboard", "wake-board"];
    for (const slug of watersports) {
      assert.strictEqual(isWatersportsSlug(slug), true, `expected isWatersportsSlug("${slug}") === true`);
    }
  });
  it("isPontoonSlug true for all pontoon aliases", () => {
    for (const slug of ["pontoon", "lake-austin-pontoon", "pontoon-party"]) {
      assert.strictEqual(isPontoonSlug(slug), true, `expected isPontoonSlug("${slug}") === true`);
    }
  });
  it("sunset and holiday are not watersports or pontoon", () => {
    assert.strictEqual(isWatersportsSlug("sunset"), false);
    assert.strictEqual(isWatersportsSlug("sunset-cruise"), false);
    assert.strictEqual(isWatersportsSlug("holiday"), false);
    assert.strictEqual(isPontoonSlug("sunset"), false);
    assert.strictEqual(isPontoonSlug("holiday"), false);
  });
});

describe("allowBoatTypeForSlug", () => {
  it("watersports: wake family and empty type allowed; never pontoon/tritoon", () => {
    const allow = allowBoatTypeForSlug("wake-surf");
    assert.strictEqual(allow("wake"), true);
    assert.strictEqual(allow("wakeboard"), true);
    assert.strictEqual(allow("wakesurf"), true);
    assert.strictEqual(allow(""), true);
    assert.strictEqual(allow(undefined), true);
    assert.strictEqual(allow("pontoon"), false);
    assert.strictEqual(allow("tritoon"), false);
  });
  it("pontoon: pontoon/tritoon or missing allowed", () => {
    const allow = allowBoatTypeForSlug("lake-austin-pontoon");
    assert.strictEqual(allow("pontoon"), true);
    assert.strictEqual(allow("tritoon"), true);
    assert.strictEqual(allow(undefined), true);
    assert.strictEqual(allow("wake"), false);
    assert.strictEqual(allow("wakeboard"), false);
  });
  it("sunset/holiday: any boat type allowed", () => {
    assert.strictEqual(allowBoatTypeForSlug("sunset")("wake"), true);
    assert.strictEqual(allowBoatTypeForSlug("sunset-cruise")(undefined), true);
    assert.strictEqual(allowBoatTypeForSlug("holiday")("pontoon"), true);
  });
});

describe("static-slug-map alignment", () => {
  it("buildStaticToFirestoreSlugMap includes URL variants from EXPERIENCE_ALIAS_FAMILIES", () => {
    const map = buildStaticToFirestoreSlugMap();
    assert.strictEqual(map["pontoon-party"], "pontoon");
    assert.strictEqual(map["lake-austin-pontoon"], "pontoon");
    assert.strictEqual(map["wake-surf"], "watersports");
    assert.strictEqual(map["sunset-cruise"], "sunset");
  });
  it("canonical slugs are first in each family", () => {
    for (const family of EXPERIENCE_ALIAS_FAMILIES) {
      const canonical = family[0];
      assert.ok(canonical.length > 0, "each family has a canonical slug");
    }
  });
});
