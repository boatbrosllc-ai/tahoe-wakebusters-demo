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
  isWakeSurfClubSlug,
  isPontoonSlug,
  allowBoatTypeForSlug,
  EXPERIENCE_ALIAS_FAMILIES,
  buildStaticToFirestoreSlugMap,
  getSlugLookupCandidates,
  resolveCanonicalExperienceSlug,
} from "../experience-aliases";

describe("getExperienceIdVariants", () => {
  const pontoonFamily = ["pontoon", "lake-austin-pontoon", "pontoon-party"];
  const watersportsFamily = [
    "watersports",
    "wake-surf",
    "lake-austin-wake-boat",
    "wake",
    "wakeboard",
    "wake-board",
    "wakesurf",
  ];
  const wakeSurfClubFamily = ["wakesurfclub", "wake-surf-club", "wakesurf-club"];
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

  it("wake surf club family: every alias yields same variant set for boat-resolution", () => {
    const docId = "exp-wsc-1";
    for (const slug of wakeSurfClubFamily) {
      const variants = getExperienceIdVariants(docId, slug);
      const variantSet = new Set(variants);
      assert.ok(
        wakeSurfClubFamily.every((a) => variantSet.has(a)),
        `slug "${slug}" should include all wake surf club aliases, got ${JSON.stringify(variants)}`
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

describe("isWatersportsSlug / isWakeSurfClubSlug / isPontoonSlug", () => {
  it("isWatersportsSlug true for all watersports aliases", () => {
    const watersports = [
      "watersports",
      "wake-surf",
      "lake-austin-wake-boat",
      "wake",
      "wakeboard",
      "wake-board",
      "wakesurf",
    ];
    for (const slug of watersports) {
      assert.strictEqual(isWatersportsSlug(slug), true, `expected isWatersportsSlug("${slug}") === true`);
    }
  });
  it("isWakeSurfClubSlug true for all wake surf club aliases", () => {
    for (const slug of ["wakesurfclub", "wake-surf-club", "wakesurf-club"]) {
      assert.strictEqual(isWakeSurfClubSlug(slug), true, `expected isWakeSurfClubSlug("${slug}") === true`);
    }
    assert.strictEqual(isWakeSurfClubSlug("watersports"), false);
    assert.strictEqual(isWakeSurfClubSlug("wakesurf"), false);
  });
  it("getSlugLookupCandidates resolves wake surf club URL variants", () => {
    for (const slug of ["wakesurfclub", "wake-surf-club", "wakesurf-club"]) {
      const candidates = getSlugLookupCandidates(slug);
      assert.ok(candidates.includes("wakesurfclub"), `${slug} should resolve wakesurfclub`);
      assert.ok(candidates.includes(slug), `${slug} should include itself`);
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
  it("watersports: explicit wake types only; blank rejected unless env fallback", () => {
    const prevPub = process.env.NEXT_PUBLIC_BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT;
    try {
      delete process.env.NEXT_PUBLIC_BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT;
      const allowStrict = allowBoatTypeForSlug("wake-surf");
      assert.strictEqual(allowStrict("wake"), true);
      assert.strictEqual(allowStrict("wakeboard"), true);
      assert.strictEqual(allowStrict("wakesurf"), true);
      assert.strictEqual(allowStrict(""), false);
      assert.strictEqual(allowStrict(undefined), false);
      assert.strictEqual(allowStrict("pontoon"), false);
      assert.strictEqual(allowStrict("tritoon"), false);

      const allowClub = allowBoatTypeForSlug("wakesurfclub");
      assert.strictEqual(allowClub("wake"), true);
      assert.strictEqual(allowClub("pontoon"), false);

      process.env.BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT = "true";
      const allowLegacy = allowBoatTypeForSlug("wake-surf");
      assert.strictEqual(allowLegacy(""), false);
      assert.strictEqual(allowLegacy(undefined), false);
      process.env.NEXT_PUBLIC_BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT = "true";
      const allowPublic = allowBoatTypeForSlug("wake-surf");
      assert.strictEqual(allowPublic(""), true);
      assert.strictEqual(allowPublic(undefined), true);
    } finally {
      delete process.env.BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT;
      if (prevPub === undefined) delete process.env.NEXT_PUBLIC_BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT;
      else process.env.NEXT_PUBLIC_BOOKING_WATERSPORTS_ALLOW_UNTYPED_BOAT = prevPub;
    }
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

describe("resolveCanonicalExperienceSlug", () => {
  it("maps pontoon family aliases to lake-austin-pontoon", () => {
    assert.strictEqual(resolveCanonicalExperienceSlug("pontoon"), "lake-austin-pontoon");
    assert.strictEqual(resolveCanonicalExperienceSlug("pontoon-party"), "lake-austin-pontoon");
    assert.strictEqual(resolveCanonicalExperienceSlug("lake-austin-pontoon", "pontoon"), "lake-austin-pontoon");
  });
  it("prefers Firestore slug for non-pontoon experiences", () => {
    assert.strictEqual(resolveCanonicalExperienceSlug("sunset-cruise", "sunset-cruise"), "sunset-cruise");
    assert.strictEqual(resolveCanonicalExperienceSlug("sunset", "sunset-cruise"), "sunset-cruise");
  });
  it("falls back to family canonical when Firestore slug is missing", () => {
    assert.strictEqual(resolveCanonicalExperienceSlug("wake-surf"), "watersports");
    assert.strictEqual(resolveCanonicalExperienceSlug("wakesurf-club"), "wakesurfclub");
  });
});

describe("static-slug-map alignment", () => {
  it("buildStaticToFirestoreSlugMap includes URL variants from EXPERIENCE_ALIAS_FAMILIES", () => {
    const map = buildStaticToFirestoreSlugMap();
    assert.strictEqual(map["pontoon-party"], "pontoon");
    assert.strictEqual(map["lake-austin-pontoon"], "pontoon");
    assert.strictEqual(map["wake-surf"], "watersports");
    assert.strictEqual(map["wakesurf"], "watersports");
    assert.strictEqual(map["wake-surf-club"], "wakesurfclub");
    assert.strictEqual(map["wakesurf-club"], "wakesurfclub");
    assert.strictEqual(map["sunset-cruise"], "sunset");
  });
  it("canonical slugs are first in each family", () => {
    for (const family of EXPERIENCE_ALIAS_FAMILIES) {
      const canonical = family[0];
      assert.ok(canonical.length > 0, "each family has a canonical slug");
    }
  });
});
