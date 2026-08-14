import { describe, it } from "node:test";
import assert from "node:assert";
import {
  formatBalanceLeadTimePhrase,
  formatRemainingBalanceShort,
  getDepositPercentNumber,
  resolveAllowDepositFromConfig,
} from "../booking-policy-copy";

describe("booking-policy-copy", () => {
  it("uses configured deposit percent label", () => {
    assert.ok(getDepositPercentNumber() >= 0 && getDepositPercentNumber() <= 100);
  });

  it("formats balance lead time from site config", () => {
    const phrase = formatBalanceLeadTimePhrase();
    assert.match(phrase, /before your trip|on arrival|at booking/);
  });

  it("formats remaining balance short label", () => {
    assert.ok(formatRemainingBalanceShort().length > 0);
  });

  it("resolveAllowDepositFromConfig rejects full-payment configs", () => {
    assert.strictEqual(
      resolveAllowDepositFromConfig({
        booking: { depositFraction: 1, balanceTiming: "at_booking" },
      } as never),
      false,
    );
    assert.strictEqual(
      resolveAllowDepositFromConfig({
        booking: { depositFraction: 0.5, balanceTiming: "hours_before" },
      } as never),
      true,
    );
    assert.strictEqual(
      resolveAllowDepositFromConfig({
        booking: { depositFraction: 0.5, balanceTiming: "on_arrival" },
      } as never),
      true,
    );
  });
});
