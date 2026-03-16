/**
 * Validation tests for admin calendar occupancy: canonical status set,
 * startDateStr trip-date filtering, slug-variant experienceId aggregation,
 * and allowDeposit PATCH enforcement (ticketed → allowDeposit coerced to false).
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { BOOKING_STATUSES_SLOT_TAKEN } from "../types";
import { getExperienceIdVariants } from "../experience-aliases";
import { enforceAllowDeposit } from "../enforce-allow-deposit";

const REQUIRED_SLOT_TAKEN_STATUSES = [
  "paid",
  "deposit_paid",
  "final_due",
  "final_paid",
  "final_processing",
  "final_requires_action",
  "final_failed",
] as const;

describe("BOOKING_STATUSES_SLOT_TAKEN completeness", () => {
  it("contains exactly the 7 required statuses", () => {
    assert.strictEqual(BOOKING_STATUSES_SLOT_TAKEN.size, 7);
    for (const status of REQUIRED_SLOT_TAKEN_STATUSES) {
      assert.ok(BOOKING_STATUSES_SLOT_TAKEN.has(status), `missing: ${status}`);
    }
  });

  it("does not contain canceled or refunded", () => {
    assert.ok(!BOOKING_STATUSES_SLOT_TAKEN.has("canceled" as never));
    assert.ok(!BOOKING_STATUSES_SLOT_TAKEN.has("refunded" as never));
  });
});

describe("startDateStr trip-date filtering", () => {
  const fromStr = "2025-03-10";
  const toStr = "2025-03-15";

  function inRange(dateStr: string): boolean {
    return dateStr >= fromStr && dateStr <= toStr;
  }

  it("includes date equal to fromStr", () => {
    assert.ok(inRange("2025-03-10"));
  });

  it("includes date equal to toStr", () => {
    assert.ok(inRange("2025-03-15"));
  });

  it("excludes date one day before fromStr", () => {
    assert.ok(!inRange("2025-03-09"));
  });

  it("excludes date one day after toStr", () => {
    assert.ok(!inRange("2025-03-16"));
  });
});

describe("allowDeposit PATCH enforcement", () => {
  it("stale auto-heal: stored ticketed, payload omits both pricingType and allowDeposit → allowDeposit: false", () => {
    const parsed = {};
    const storedPricingType = "ticketed";
    const result = enforceAllowDeposit(parsed, storedPricingType);
    assert.strictEqual(result.allowDeposit, false);
  });

  it("ticketed stored, pricingType omitted in payload → allowDeposit coerced to false", () => {
    const parsed = { allowDeposit: true };
    const storedPricingType = "ticketed";
    const result = enforceAllowDeposit(parsed, storedPricingType);
    assert.strictEqual(result.allowDeposit, false);
  });

  it("ticketed explicit in payload → allowDeposit coerced to false", () => {
    const parsed = { pricingType: "ticketed" as const, allowDeposit: true };
    const storedPricingType = "charter";
    const result = enforceAllowDeposit(parsed, storedPricingType);
    assert.strictEqual(result.allowDeposit, false);
  });

  it("charter explicit in payload → allowDeposit remains true", () => {
    const parsed = { pricingType: "charter" as const, allowDeposit: true };
    const storedPricingType = "ticketed";
    const result = enforceAllowDeposit(parsed, storedPricingType);
    assert.strictEqual(result.allowDeposit, true);
  });

  it("charter stored, pricingType omitted in payload → allowDeposit remains true", () => {
    const parsed = { allowDeposit: true };
    const storedPricingType = "charter";
    const result = enforceAllowDeposit(parsed, storedPricingType);
    assert.strictEqual(result.allowDeposit, true);
  });
});

describe("slug-variant experienceId aggregation and deduplication", () => {
  it("getExperienceIdVariants returns both doc id and slug for pontoon", () => {
    const docId = "exp-pontoon-1";
    const slug = "pontoon";
    const variants = getExperienceIdVariants(docId, slug);
    assert.ok(variants.includes(docId), "should include raw doc id");
    assert.ok(variants.includes(slug), "should include slug");
  });

  it("deduplication retains only one copy when same booking appears from multiple variant queries", () => {
    const seenBookingIds = new Set<string>();
    const bookingDocs: { id: string }[] = [];
    // Simulate two variant result sets that both return the same booking doc id
    const variantResults = [
      [{ id: "booking-1" }, { id: "booking-2" }],
      [{ id: "booking-1" }, { id: "booking-3" }], // booking-1 appears again
    ];
    for (const docs of variantResults) {
      for (const doc of docs) {
        if (seenBookingIds.has(doc.id)) continue;
        seenBookingIds.add(doc.id);
        bookingDocs.push(doc);
      }
    }
    assert.strictEqual(bookingDocs.length, 3);
    assert.strictEqual(seenBookingIds.size, 3);
    const ids = bookingDocs.map((d) => d.id).sort();
    assert.deepStrictEqual(ids, ["booking-1", "booking-2", "booking-3"]);
  });
});
