import { describe, it } from "node:test";
import assert from "node:assert";
import {
  displayMarketplaceGuestEmail,
  extractMarketplaceGuestEmail,
  isSyntheticMarketplaceGuestEmail,
  resolveMarketplaceGuestEmail,
} from "../guest-contact";

describe("marketplace guest email", () => {
  it("treats the ingest placeholder as synthetic, not a guest mailbox", () => {
    assert.equal(
      isSyntheticMarketplaceGuestEmail("marketplace+boatsetter-xtpkjgm@noreply.example.com"),
      true
    );
    assert.equal(displayMarketplaceGuestEmail("marketplace+boatsetter-xtpkjgm@noreply.example.com"), "");
    assert.equal(displayMarketplaceGuestEmail("sean@example.com"), "sean@example.com");
  });

  it("reads a labeled guest email and ignores Boatsetter sender addresses", () => {
    assert.equal(
      extractMarketplaceGuestEmail("Renter: Sean\nEmail: sean@lakeaustin.com\n"),
      "sean@lakeaustin.com"
    );
    assert.equal(
      extractMarketplaceGuestEmail("Renter: Sean", '<a href="mailto:boatsetter@mail.boatsetter.com">Boatsetter</a>'),
      undefined
    );
    assert.equal(
      extractMarketplaceGuestEmail("Renter: Sean", '<a href="mailto:Sean%40lakeaustin.com">email</a>'),
      "sean@lakeaustin.com"
    );
  });

  it("does not invent a placeholder when Boatsetter omitted the guest email", () => {
    assert.equal(
      resolveMarketplaceGuestEmail({
        storedEmail: "marketplace+boatsetter-xtpkjgm@noreply.example.com",
      }),
      ""
    );
    assert.equal(
      resolveMarketplaceGuestEmail({
        parsedEmail: "sean@lakeaustin.com",
        storedEmail: "marketplace+boatsetter-xtpkjgm@noreply.example.com",
      }),
      "sean@lakeaustin.com"
    );
  });
});
