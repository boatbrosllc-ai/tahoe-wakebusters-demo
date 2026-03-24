/**
 * Contract: slots API conservative status matches create-hold strictness when legacy coverage is incomplete.
 */
import assert from "node:assert";
import { describe, it } from "node:test";
import { conservativeOpenSlotStatus, getLegacyBookingScanLimit } from "../legacy-booking-scan-limit";

describe("slots vs create-hold legacy alignment helpers", () => {
  it("getLegacyBookingScanLimit parses env consistently", () => {
    const prev = process.env.LEGACY_BOOKING_SCAN_LIMIT;
    process.env.LEGACY_BOOKING_SCAN_LIMIT = "2000";
    assert.strictEqual(getLegacyBookingScanLimit(), 2000);
    process.env.LEGACY_BOOKING_SCAN_LIMIT = "400";
    assert.strictEqual(getLegacyBookingScanLimit(), 2000);
    process.env.LEGACY_BOOKING_SCAN_LIMIT = "5000";
    assert.strictEqual(getLegacyBookingScanLimit(), 5000);
    process.env.LEGACY_BOOKING_SCAN_LIMIT = prev;
  });

  it("conservativeOpenSlotStatus never leaves 'open' when legacy scan is incomplete", () => {
    assert.strictEqual(conservativeOpenSlotStatus("open", true), "blocked");
    assert.strictEqual(conservativeOpenSlotStatus("blocked", true), "blocked");
    assert.strictEqual(conservativeOpenSlotStatus("booked", true), "booked");
    assert.strictEqual(conservativeOpenSlotStatus("open", false), "open");
  });
});
