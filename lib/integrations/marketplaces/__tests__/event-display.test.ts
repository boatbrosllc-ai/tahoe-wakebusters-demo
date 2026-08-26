import { describe, it } from "node:test";
import assert from "node:assert";
import {
  formatMarketplaceUsd,
  marketplaceEventAmountCents,
  marketplaceEventGuestName,
} from "../event-display";

describe("marketplace event display", () => {
  it("prefers the parsed guest name over a generic booking name", () => {
    assert.equal(
      marketplaceEventGuestName({ customerName: "Paula" }, { customer: { name: "Marketplace guest" } }),
      "Paula"
    );
    assert.equal(
      marketplaceEventGuestName({ customerName: "", details: { Renter: "Timothy Mattox" } }),
      "Timothy Mattox"
    );
    assert.equal(
      marketplaceEventGuestName({}, { customer: { name: "Marketplace guest" } }),
      null
    );
  });

  it("prefers stored payout cents, then email details", () => {
    assert.equal(marketplaceEventAmountCents({ totalCents: 46462 }), 46462);
    assert.equal(
      marketplaceEventAmountCents({ details: { "Your Payout": "$124.60" } }),
      12460
    );
    assert.equal(
      marketplaceEventAmountCents({}, { pricing: { totalCents: 35000 } }),
      35000
    );
  });

  it("formats USD for the inbox table", () => {
    assert.equal(formatMarketplaceUsd(46462), "$464.62");
    assert.equal(formatMarketplaceUsd(35000), "$350.00");
  });
});
