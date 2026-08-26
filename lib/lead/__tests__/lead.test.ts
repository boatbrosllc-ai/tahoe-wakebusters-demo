import { describe, it } from "node:test";
import assert from "node:assert";
import {
  daysWaiting,
  leadInterestLabel,
  leadSourceLabel,
  parseLeadCaptureBody,
  publicBookingPath,
  suggestedLeadEmails,
} from "../lead";

describe("lead labels", () => {
  it("maps known sources and interests", () => {
    assert.strictEqual(leadSourceLabel("home_lead_capture"), "Homepage");
    assert.strictEqual(leadSourceLabel("contact"), "Contact form");
    assert.strictEqual(leadInterestLabel("bachelorette"), "Bachelorette");
    assert.strictEqual(leadInterestLabel(null), "Unknown");
  });

  it("counts whole days waiting", () => {
    const now = Date.parse("2026-08-20T12:00:00.000Z");
    assert.strictEqual(daysWaiting("2026-08-08T12:00:00.000Z", now), 12);
    assert.strictEqual(daysWaiting(null, now), null);
  });

  it("picks a booking path from interest", () => {
    assert.strictEqual(publicBookingPath("wake"), "/experiences/watersports");
    assert.strictEqual(publicBookingPath("bachelorette"), "/austin-bachelorette-boat-rental");
    assert.strictEqual(publicBookingPath(null), "/book");
  });
});

describe("parseLeadCaptureBody", () => {
  it("requires a valid email", () => {
    const bad = parseLeadCaptureBody({ email: "nope", source: "home_lead_capture" });
    assert.deepStrictEqual(bad, { error: "Valid email required" });
  });

  it("accepts name, phone, and interest", () => {
    const parsed = parseLeadCaptureBody({
      email: "  Pat@X.com ",
      name: "Pat",
      phone: "5125550100",
      source: "austin-bachelorette-boat-rental",
      page: "/austin-bachelorette-boat-rental",
      interest: "Bachelorette",
    });
    assert.ok(!("error" in parsed));
    if ("error" in parsed) return;
    assert.strictEqual(parsed.email, "Pat@X.com");
    assert.strictEqual(parsed.name, "Pat");
    assert.strictEqual(parsed.interest, "bachelorette");
  });

  it("keeps Google Ads click attribution when posted with the lead", () => {
    const parsed = parseLeadCaptureBody({
      email: "pat@x.com",
      source: "home_lead_capture",
      adsAttribution: { gclid: "EAIaIQobChMItestclickid123", utmCampaign: "2026-search" },
    });
    assert.ok(!("error" in parsed));
    if ("error" in parsed) return;
    assert.equal(parsed.adsAttribution?.channel, "google_ads");
    assert.equal(parsed.adsAttribution?.utmCampaign, "2026-search");
  });
});

describe("suggestedLeadEmails", () => {
  it("includes a booking URL and first name", () => {
    const emails = suggestedLeadEmails({
      firstName: "Sam",
      interest: "pontoon",
      bookingUrl: "https://example.com/book",
    });
    assert.ok(emails.length >= 2);
    assert.ok(emails[0].body.includes("Sam"));
    assert.ok(emails[0].body.includes("https://example.com/book"));
    assert.ok(emails[0].body.includes("pontoon"));
  });
});
