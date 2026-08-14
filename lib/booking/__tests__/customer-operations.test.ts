import { describe, it } from "node:test";
import assert from "node:assert";
import { isNsfHalfDayBundle } from "@/content/charter-windows";
import { getDepositLeadTimeHours, getOperatingEndHour, getOperatingStartHour } from "@/lib/booking/customer-operations";

describe("customer-operations (site config defaults)", () => {
  it("uses hourly slot selection by default (not Cabo fixed windows)", () => {
    assert.strictEqual(isNsfHalfDayBundle("half-day"), false);
    assert.strictEqual(isNsfHalfDayBundle("full-day"), false);
  });

  it("exposes operating hours from site config", () => {
    assert.ok(getOperatingStartHour() >= 0 && getOperatingStartHour() <= 23);
    assert.ok(getOperatingEndHour() >= getOperatingStartHour());
  });

  it("defaults deposit lead time to 48 hours when unset", () => {
    assert.strictEqual(getDepositLeadTimeHours(), 48);
  });
});
