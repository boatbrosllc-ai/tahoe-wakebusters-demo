import { brand } from "@/content/brand";
/**
 * Experience alias / boat-resolution contract tests for ${brand.companyName}.
 * Firestore slugs `pontoon` / `watersports` are intentional legacy IDs for Half/Full Day.
 */

import { describe, it } from "node:test";
import assert from "node:assert";
import {
  EXPERIENCE_ALIAS_FAMILIES,
  getExperienceIdVariants,
  getSlugLookupCandidates,
  boatMatchesExperience,
  isPontoonSlug,
  isWatersportsSlug,
  isWakeSurfClubSlug,
  allowBoatTypeForSlug,
  resolveCanonicalExperienceSlug,
  buildStaticToFirestoreSlugMap,
} from "../experience-aliases";

describe("EXPERIENCE_ALIAS_FAMILIES", () => {
  const halfFamily = ["pontoon", "nasty-half-day", "half-day"];
  const fullFamily = ["watersports", "nasty-full-day", "full-day"];

  it("pontoon family: every alias yields same variant set", () => {
    const docId = "exp-pontoon-1";
    const expectedIds = new Set([docId, ...halfFamily]);
    for (const slug of halfFamily) {
      const variants = getExperienceIdVariants(docId, slug);
      const variantSet = new Set(variants);
      assert.ok(
        halfFamily.every((a) => variantSet.has(a)),
        `slug "${slug}" should include all half-day aliases, got ${JSON.stringify(variants)}`
      );
      assert.ok(variantSet.has(docId));
      assert.strictEqual(expectedIds.size, variantSet.size);
    }
  });

  it("watersports family: every alias yields same variant set", () => {
    const docId = "exp-full-1";
    for (const slug of fullFamily) {
      const variants = getExperienceIdVariants(docId, slug);
      const variantSet = new Set(variants);
      assert.ok(fullFamily.every((a) => variantSet.has(a)));
    }
  });
});

describe("getSlugLookupCandidates", () => {
  it("orders requested slug first then family", () => {
    const c = getSlugLookupCandidates("nasty-half-day");
    assert.strictEqual(c[0], "nasty-half-day");
    assert.ok(c.includes("pontoon"));
  });
});

describe("boatMatchesExperience", () => {
  it("matches doc id", () => {
    assert.strictEqual(boatMatchesExperience({ experienceIds: ["exp-1"] }, "exp-1", "pontoon"), true);
  });
  it("matches family alias", () => {
    assert.strictEqual(boatMatchesExperience({ experienceIds: ["nasty-half-day"] }, "exp-1", "pontoon"), true);
  });
  it("rejects unrelated", () => {
    assert.strictEqual(boatMatchesExperience({ experienceIds: ["other-exp"] }, "exp-1", "pontoon"), false);
  });
  it("empty experienceIds", () => {
    assert.strictEqual(boatMatchesExperience({ experienceIds: [] }, "exp-1", "pontoon"), false);
    assert.strictEqual(boatMatchesExperience({}, "exp-1", "pontoon"), false);
  });
});

describe("slug helpers", () => {
  it("isPontoonSlug true for half-day family", () => {
    for (const slug of ["pontoon", "nasty-half-day", "half-day"]) {
      assert.strictEqual(isPontoonSlug(slug), true);
    }
  });
  it("isWatersportsSlug true for full-day family", () => {
    for (const slug of ["watersports", "nasty-full-day", "full-day"]) {
      assert.strictEqual(isWatersportsSlug(slug), true);
    }
  });
  it("wake surf club family removed", () => {
    assert.strictEqual(isWakeSurfClubSlug("wakesurf-club"), false);
  });
  it("sunset and holiday are not half/full", () => {
    assert.strictEqual(isWatersportsSlug("sunset"), false);
    assert.strictEqual(isPontoonSlug("holiday"), false);
  });
});

describe("allowBoatTypeForSlug", () => {
  it("half/full day: any boat type so packages share inventory", () => {
    for (const slug of ["pontoon", "nasty-half-day", "watersports", "nasty-full-day"]) {
      const allow = allowBoatTypeForSlug(slug);
      assert.strictEqual(allow("wake"), true, slug);
      assert.strictEqual(allow("pontoon"), true, slug);
      assert.strictEqual(allow(""), true, slug);
    }
  });
  it("sunset/holiday: any boat type allowed", () => {
    assert.strictEqual(allowBoatTypeForSlug("sunset")("wake"), true);
    assert.strictEqual(allowBoatTypeForSlug("holiday")("pontoon"), true);
  });
});

describe("resolveCanonicalExperienceSlug", () => {
  it("maps half-day family to nasty-half-day", () => {
    assert.strictEqual(resolveCanonicalExperienceSlug("pontoon"), "nasty-half-day");
    assert.strictEqual(resolveCanonicalExperienceSlug("half-day"), "nasty-half-day");
    assert.strictEqual(resolveCanonicalExperienceSlug("nasty-half-day", "pontoon"), "nasty-half-day");
  });
  it("maps full-day family to nasty-full-day", () => {
    assert.strictEqual(resolveCanonicalExperienceSlug("watersports"), "nasty-full-day");
    assert.strictEqual(resolveCanonicalExperienceSlug("full-day"), "nasty-full-day");
  });
  it("uses Firestore slug for specialty experiences", () => {
    assert.strictEqual(resolveCanonicalExperienceSlug("sunset", "sunset"), "sunset");
  });
});

describe("static-slug-map alignment", () => {
  it("buildStaticToFirestoreSlugMap includes NSF public aliases", () => {
    const map = buildStaticToFirestoreSlugMap();
    assert.strictEqual(map["nasty-half-day"], "pontoon");
    assert.strictEqual(map["half-day"], "pontoon");
    assert.strictEqual(map["nasty-full-day"], "watersports");
    assert.strictEqual(map["full-day"], "watersports");
  });
  it("canonical slugs are first in each family", () => {
    for (const family of EXPERIENCE_ALIAS_FAMILIES) {
      assert.ok(family[0].length > 0);
    }
  });
});
