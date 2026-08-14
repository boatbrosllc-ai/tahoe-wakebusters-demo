import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "fs";
import path from "path";
import { validateLaunchPacket } from "@/lib/launch/customer-platform-config.schema";
import { mapPacketToSiteConfig } from "@/lib/launch/map-packet-to-site-config";
import { resolveFirestoreExperienceSlug } from "@/lib/launch/resolve-firestore-experience-slug";
import { resolveAllowDepositFromConfig } from "@/lib/booking/booking-policy-copy";

const fixturePath = path.join(
  process.cwd(),
  "lib/launch/__fixtures__/sample-launch-packet.json",
);

describe("validateLaunchPacket", () => {
  it("accepts the sample launch packet fixture", () => {
    const raw = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    const result = validateLaunchPacket(raw);
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.config.siteId, "lake-austin-charters");
      assert.ok(result.warnings.some((w) => w.includes("taxRate")));
    }
  });

  it("rejects missing required fields with clear paths", () => {
    const result = validateLaunchPacket({ version: "1.0" });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some((e) => e.includes("orgId")));
      assert.ok(result.errors.some((e) => e.includes("boats")));
    }
  });

  it("rejects boat referencing unknown experience slug", () => {
    const raw = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    raw.boats[0].experienceSlugs = ["unknown-trip"];
    const result = validateLaunchPacket(raw);
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some((e) => e.includes("unknown experience slug")));
    }
  });
});

describe("mapPacketToSiteConfig", () => {
  it("maps tenantId, timezone, deposit, and tax default", () => {
    const raw = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    const validated = validateLaunchPacket(raw);
    assert.strictEqual(validated.ok, true);
    if (!validated.ok) return;

    const site = mapPacketToSiteConfig(validated.config);
    assert.strictEqual(site.tenantId, "lake-austin-charters");
    assert.strictEqual(site.business.timezone, "America/Chicago");
    assert.strictEqual(site.booking.depositFraction, 0.5);
    assert.strictEqual(site.booking.minimumNoticeHours, 48);
    assert.strictEqual(site.booking.slotSelectionMode, "hourly");
    assert.strictEqual(site.operations?.operatingHours?.startHour, 7);
    assert.strictEqual(site.business.taxRate, 0);
    assert.strictEqual(site.company.domain, "lakeaustincharters.com");
    assert.strictEqual(resolveAllowDepositFromConfig(site), true);
  });
});

describe("resolveFirestoreExperienceSlug", () => {
  it("maps public half-day/full-day slugs to engine slugs", () => {
    assert.strictEqual(resolveFirestoreExperienceSlug({ slug: "half-day" }), "pontoon");
    assert.strictEqual(resolveFirestoreExperienceSlug({ slug: "full-day" }), "watersports");
  });
});
