import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isGoogleAdsAttribution,
  parseAdsAttributionFromSearchParams,
  parseAdsAttributionFromUnknown,
  adsAttributionLabel,
  adsAttributionAdLabel,
  adsAttributionDisplay,
} from "../attribution";

describe("ads attribution", () => {
  it("treats a gclid landing as Google Ads", () => {
    const attr = parseAdsAttributionFromSearchParams(
      new URLSearchParams("gclid=EAIaIQobChMItestclickid123&utm_campaign=2026-search"),
      "/book"
    );
    assert.ok(attr);
    assert.equal(attr!.channel, "google_ads");
    assert.equal(attr!.gclid, "EAIaIQobChMItestclickid123");
    assert.equal(attr!.utmCampaign, "2026-search");
    assert.equal(attr!.landingPath, "/book");
    assert.equal(isGoogleAdsAttribution(attr), true);
    assert.equal(adsAttributionLabel(attr), "2026-search");
  });

  it("treats google + cpc UTMs as Google Ads without gclid", () => {
    const attr = parseAdsAttributionFromSearchParams(
      new URLSearchParams("utm_source=google&utm_medium=cpc&utm_campaign=austin-boat-rental"),
      "/pontoon-boat-rental-austin"
    );
    assert.ok(attr);
    assert.equal(attr!.channel, "google_ads");
    assert.equal(attr!.utmCampaign, "austin-boat-rental");
  });

  it("ignores organic or empty landings", () => {
    assert.equal(parseAdsAttributionFromSearchParams(new URLSearchParams(""), "/"), null);
    assert.equal(
      parseAdsAttributionFromSearchParams(new URLSearchParams("utm_source=instagram&utm_medium=social"), "/"),
      null
    );
  });

  it("captures ad title from utm_content and falls back to ad id", () => {
    const named = parseAdsAttributionFromSearchParams(
      new URLSearchParams(
        "gclid=EAIaIQobChMItestclickid123&utm_campaign=218394012&utm_content=Lake Austin Pontoon&utm_term=boat rental austin&adid=74651234"
      ),
      "/"
    );
    assert.equal(named!.utmContent, "Lake Austin Pontoon");
    assert.equal(named!.adId, "74651234");
    assert.equal(adsAttributionAdLabel(named), "Lake Austin Pontoon");

    const idOnly = parseAdsAttributionFromSearchParams(
      new URLSearchParams("gclid=EAIaIQobChMItestclickid123&adid=74651234"),
      "/"
    );
    assert.equal(adsAttributionAdLabel(idOnly), "Ad 74651234");
    assert.equal(parseAdsAttributionFromSearchParams(new URLSearchParams("gclid=EAIaIQobChMItestclickid123&utm_content={_ad}"), "/")?.utmContent, undefined);
  });

  it("captures keyword, device, network, match type, and ad group", () => {
    const attr = parseAdsAttributionFromSearchParams(
      new URLSearchParams(
        "gclid=EAIaIQobChMItestclickid123&utm_campaign=218394012&utm_term=boat+rental+austin&adid=74651234&agid=998877&match=e&net=g&dev=m&place=example.com"
      ),
      "/"
    );
    assert.equal(attr!.utmTerm, "boat rental austin");
    assert.equal(attr!.adGroupId, "998877");
    assert.equal(attr!.matchType, "e");
    assert.equal(attr!.network, "g");
    assert.equal(attr!.device, "m");
    assert.equal(attr!.placement, "example.com");
    const display = adsAttributionDisplay(attr);
    assert.equal(display.keyword, "boat rental austin");
    assert.equal(display.matchType, "Exact match");
    assert.equal(display.network, "Google Search");
    assert.equal(display.device, "Mobile");
    assert.equal(display.ad, "Ad 74651234");
  });

  it("rejects junk click ids from posted bodies", () => {
    assert.equal(parseAdsAttributionFromUnknown({ gclid: "<script>" }), null);
    assert.equal(parseAdsAttributionFromUnknown({ gclid: "short" }), null);
    const ok = parseAdsAttributionFromUnknown({ gclid: "EAIaIQobChMItestclickid123" });
    assert.equal(ok?.channel, "google_ads");
  });
});
