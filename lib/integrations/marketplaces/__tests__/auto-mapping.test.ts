import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { autoMappingFromEvent, guessMarketplaceExperience, pickListingBoatId } from "../mapping";

describe("auto marketplace listing mapping", () => {
  it("guesses wake, pontoon, sunset, and mercury engine pontoon names", () => {
    assert.equal(guessMarketplaceExperience("AXIS WAKE RESEARCH A24 W/TRAILER")?.experienceSlug, "watersports");
    assert.equal(guessMarketplaceExperience("JC and Neptoon Pontoon 266 Tritoon")?.experienceSlug, "pontoon");
    assert.equal(guessMarketplaceExperience("MERCURY 150L VERADO 4-STROKE")?.experienceSlug, "pontoon");
    assert.deepEqual(guessMarketplaceExperience("Lake Austin Sunset Boat Ride"), {
      experienceSlug: "sunset",
      durationHours: 2,
    });
  });

  it("does not guess unclear or junk names", () => {
    assert.equal(guessMarketplaceExperience("http://click.getmyboat.com/track/click/8568605"), null);
    assert.equal(guessMarketplaceExperience("Get ready to earn $464.62"), null);
    assert.equal(guessMarketplaceExperience("boat"), null);
  });

  it("does not guess when two trip types appear in the same name", () => {
    assert.equal(guessMarketplaceExperience("Sunset pontoon cruise"), null);
  });

  it("builds a saved mapping from an obvious event", () => {
    const map = autoMappingFromEvent({
      provider: "getmyboat",
      externalListingName: "Axis Wake Surf Boat w/ Captain – 14 Guests - Lake Austin",
    });
    assert.equal(map?.experienceSlug, "watersports");
    assert.equal(map?.autoMapped, true);
    assert.equal(map?.matchType, "listing_name");
  });

  it("saves the listing name even if the listing id is a tracking url", () => {
    const map = autoMappingFromEvent({
      provider: "getmyboat",
      externalListingId: "http://click.getmyboat.com/track/click/8568605",
      externalListingName: "Axis Wake Surf Boat w/ Captain – 14 Guests - Lake Austin",
    });
    assert.equal(map?.matchType, "listing_name");
    assert.equal(map?.experienceSlug, "watersports");
  });

  it("picks the matching pontoon when an experience has several boats", () => {
    const boats = [
      { id: "neptoon", name: "JC Neptoon Tritoon - 14 Person Capacity" },
      { id: "bentley", name: "Bentley Tritoon  - 14 Person Capacity" },
      { id: "suntracker", name: "Suntracker Tritoon - 14 Person Capacity" },
    ];
    assert.equal(pickListingBoatId(boats, "MERCURY 150L VERADO 4-STROKE"), "suntracker");
    assert.equal(pickListingBoatId(boats, "JC and Neptoon Pontoon 266 TriToon"), "neptoon");
    assert.equal(pickListingBoatId(boats, "Encore Bentley 243 Navigator"), "bentley");
  });
});
