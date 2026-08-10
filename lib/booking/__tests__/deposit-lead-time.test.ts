/**
 * Deposit lead-time eligibility (48h America/Mazatlan boundary vs cron finalChargeAt) for create-payment-intent guard.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { isDepositEligibleByLeadTime, computeFinalChargeAtUtc } from "../final-charge-at";

describe("isDepositEligibleByLeadTime", () => {
  it("returns true when now is strictly before computed final charge time", () => {
    const slotStartMs = Date.parse("2026-06-15T18:00:00.000Z");
    const finalChargeAt = computeFinalChargeAtUtc(new Date(slotStartMs));
    assert.strictEqual(isDepositEligibleByLeadTime(slotStartMs, finalChargeAt.getTime() - 1), true);
  });

  it("returns false when now is at or after computed final charge time", () => {
    const slotStartMs = Date.parse("2026-06-15T18:00:00.000Z");
    const finalChargeAt = computeFinalChargeAtUtc(new Date(slotStartMs));
    assert.strictEqual(isDepositEligibleByLeadTime(slotStartMs, finalChargeAt.getTime()), false);
    assert.strictEqual(isDepositEligibleByLeadTime(slotStartMs, finalChargeAt.getTime() + 1), false);
  });

  it("returns true for a trip well in the future relative to now", () => {
    const nowMs = Date.parse("2026-01-01T12:00:00.000Z");
    const slotStartMs = Date.parse("2026-06-15T18:00:00.000Z");
    assert.strictEqual(isDepositEligibleByLeadTime(slotStartMs, nowMs), true);
  });

  it("returns false when slot start equals now", () => {
    const nowMs = 9_000_000;
    assert.strictEqual(isDepositEligibleByLeadTime(nowMs, nowMs), false);
  });
});
