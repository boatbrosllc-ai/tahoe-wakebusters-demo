import { describe, it } from "node:test";
import assert from "node:assert";
import { extractMarketplaceAmountCents, extractMarketplaceGuestPaidCents, moneyToCents, payoutCentsFromMarketplaceFields } from "../money";

describe("marketplace money", () => {
  it("parses dollar and USD strings into cents", () => {
    assert.equal(moneyToCents("$464.62"), 46462);
    assert.equal(moneyToCents("USD 124.60"), 12460);
    assert.equal(moneyToCents("1,234.00 USD"), 123400);
    assert.equal(moneyToCents("350"), 35000);
    assert.equal(moneyToCents("2026"), null);
  });

  it("prefers Boatsetter owner payout language", () => {
    assert.equal(
      extractMarketplaceAmountCents("Get ready to earn $464.62. Instant Book means that this trip is automatically approved."),
      46462
    );
  });

  it("prefers Viator net rate over retail", () => {
    assert.equal(
      extractMarketplaceAmountCents("Retail Price: USD 178.00\nNet Rate: USD 124.60"),
      12460
    );
    assert.equal(
      extractMarketplaceAmountCents("Net Rate\nUSD 124.60"),
      12460
    );
  });

  it("reads You earn on its own line", () => {
    assert.equal(
      extractMarketplaceAmountCents("Earnings\n\nYou earn\n\n$464.62"),
      46462
    );
  });

  it("parses USD $ net rate", () => {
    assert.equal(extractMarketplaceAmountCents("Net Rate: USD $81.90"), 8190);
  });

  it("parses Getmyboat Your Payout over renter payments", () => {
    const body = `Your Payout	USD $831.90\nRenter Payments	USD $1,082.18`;
    assert.equal(extractMarketplaceAmountCents(body, ["Your Payout", "Payout"]), 83190);
    assert.equal(extractMarketplaceGuestPaidCents(body), 108218);
  });

  it("recovers payout from stored details and excerpt when totalCents is missing", () => {
    assert.equal(
      payoutCentsFromMarketplaceFields({
        details: { "Net Rate": "USD $81.90" },
        excerpt: "Booking Reference: BR-1",
      }),
      8190
    );
    assert.equal(
      payoutCentsFromMarketplaceFields({
        excerpt: "Get ready to earn $464.62. Instant Book means that this trip is automatically approved.",
      }),
      46462
    );
    assert.equal(
      payoutCentsFromMarketplaceFields({
        notes: "viator — Ref: BR-1437096751 — Lake Austin Sunset Boat Ride — Earnings: USD $81.90",
      }),
      8190
    );
  });

  it("reads Net Rate from HTML table cells", async () => {
    const { htmlToNormalizedText } = await import("../html-to-text");
    const body = htmlToNormalizedText(
      "<table><tr><td>Net Rate</td></tr><tr><td>USD $81.90</td></tr></table>"
    );
    assert.equal(extractMarketplaceAmountCents(body, ["Net Rate", "Total Net Rate"]), 8190);
  });
});
