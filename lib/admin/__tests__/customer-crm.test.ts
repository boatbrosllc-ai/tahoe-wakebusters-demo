import { describe, it } from "node:test";
import assert from "node:assert";
import {
  activityTitleForEmailLog,
  adminCrmEmailToHtml,
  customerKindFromBookingCount,
  customerProfilePath,
  customerStatusLabel,
  emailLookupVariants,
  emptyLeadListItem,
  isLapsedCustomer,
  matchesCustomerSegment,
  mergeCustomerRecords,
  normalizeCustomerEmail,
  parseAdminCrmEmailBody,
  sortActivityNewestFirst,
  type CustomerActivityItem,
  type CustomerListItem,
} from "../customer-crm";

describe("normalizeCustomerEmail / lookup variants", () => {
  it("lowercases and trims", () => {
    assert.strictEqual(normalizeCustomerEmail("  Jane@example.com "), "jane@example.com");
    assert.strictEqual(normalizeCustomerEmail(""), "");
  });

  it("returns original and lowercase when they differ", () => {
    assert.deepStrictEqual(emailLookupVariants("Jane@X.com"), ["Jane@X.com", "jane@x.com"]);
    assert.deepStrictEqual(emailLookupVariants("jane@x.com"), ["jane@x.com"]);
    assert.deepStrictEqual(emailLookupVariants("  "), []);
  });
});

describe("customer kind / segments", () => {
  it("treats zero bookings as a lead", () => {
    assert.strictEqual(customerKindFromBookingCount(0), "lead");
    assert.strictEqual(customerKindFromBookingCount(1), "customer");
  });

  it("flags lapsed after 365 days", () => {
    const now = Date.parse("2026-08-20T12:00:00.000Z");
    assert.strictEqual(isLapsedCustomer("2025-08-20T12:00:00.000Z", now), true);
    assert.strictEqual(isLapsedCustomer("2026-01-01T00:00:00.000Z", now), false);
    assert.strictEqual(isLapsedCustomer(null, now), false);
  });

  it("labels lead / customer / repeat", () => {
    assert.strictEqual(customerStatusLabel({ kind: "lead", bookingCount: 0, lastBookingAt: null }), "Lead");
    assert.strictEqual(
      customerStatusLabel({ kind: "lead", bookingCount: 0, lastBookingAt: null, lastContactedAt: "2026-08-01T00:00:00.000Z" }),
      "Contacted"
    );
    assert.strictEqual(customerStatusLabel({ kind: "customer", bookingCount: 1, lastBookingAt: "2026-07-01T00:00:00.000Z" }), "Customer");
    assert.strictEqual(customerStatusLabel({ kind: "customer", bookingCount: 3, lastBookingAt: "2026-07-01T00:00:00.000Z" }), "Repeat");
  });

  it("filters segments", () => {
    const lead: CustomerListItem = emptyLeadListItem({ email: "a@b.com", source: "home" });
    const guest: CustomerListItem = {
      ...lead,
      email: "c@d.com",
      bookingCount: 1,
      kind: "customer",
      lastBookingAt: "2026-07-01T00:00:00.000Z",
      marketingOptIn: false,
    };
    const repeat: CustomerListItem = { ...guest, email: "e@f.com", bookingCount: 2 };
    assert.strictEqual(matchesCustomerSegment(lead, "leads"), true);
    assert.strictEqual(matchesCustomerSegment(guest, "customers"), true);
    assert.strictEqual(matchesCustomerSegment(repeat, "repeat"), true);
    assert.strictEqual(matchesCustomerSegment(lead, "repeat"), false);
  });
});

describe("mergeCustomerRecords", () => {
  it("upgrades a lead to a customer and sums bookings", () => {
    const lead = emptyLeadListItem({
      email: "Pat@X.com",
      source: "home_lead_capture",
      capturedAt: "2026-01-01T00:00:00.000Z",
    });
    const booking: CustomerListItem = {
      email: "pat@x.com",
      name: "Pat",
      phone: "5125550100",
      bookingCount: 1,
      lastBookingAt: "2026-06-01T00:00:00.000Z",
      totalSpentCents: 50000,
      kind: "customer",
      marketingOptIn: true,
      lastExperienceName: "Pontoon",
      leadSource: null,
      leadCapturedAt: null,
      leadInterest: null,
      leadPage: null,
      lastContactedAt: null,
      leadMessage: null,
    };
    const merged = mergeCustomerRecords([lead], [booking]);
    assert.strictEqual(merged.length, 1);
    assert.strictEqual(merged[0].kind, "customer");
    assert.strictEqual(merged[0].name, "Pat");
    assert.strictEqual(merged[0].bookingCount, 1);
    assert.strictEqual(merged[0].totalSpentCents, 50000);
    assert.strictEqual(merged[0].leadSource, "home_lead_capture");
    assert.strictEqual(merged[0].leadCapturedAt, "2026-01-01T00:00:00.000Z");
    assert.strictEqual(merged[0].marketingOptIn, true);
  });

  it("keeps newer lead name and interest when merging two leads", () => {
    const older = emptyLeadListItem({
      email: "a@b.com",
      source: "home_lead_capture",
      capturedAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = emptyLeadListItem({
      email: "a@b.com",
      name: "Alex",
      source: "contact",
      capturedAt: "2026-06-01T00:00:00.000Z",
      interest: "pontoon",
      message: "Weekend in July",
    });
    const merged = mergeCustomerRecords([older], [newer]);
    assert.strictEqual(merged[0].name, "Alex");
    assert.strictEqual(merged[0].leadInterest, "pontoon");
    assert.strictEqual(merged[0].leadSource, "home_lead_capture");
    assert.strictEqual(merged[0].leadMessage, "Weekend in July");
  });
});

describe("customerProfilePath", () => {
  it("encodes the email for the profile URL", () => {
    assert.strictEqual(customerProfilePath("Jane@X.com"), "/admin/customers/Jane%40X.com");
  });
});

describe("admin CRM email", () => {
  it("rejects invalid payloads", () => {
    assert.deepStrictEqual(parseAdminCrmEmailBody(null), { error: "Request body must be a JSON object." });
    const missing = parseAdminCrmEmailBody({ to: "not-an-email", subject: "Hi", body: "Hello" });
    assert.ok("error" in missing);
    const noSubject = parseAdminCrmEmailBody({ to: "a@b.com", subject: "  ", body: "Hello" });
    assert.deepStrictEqual(noSubject, { error: "Subject is required." });
  });

  it("accepts a valid send and escapes HTML in the body", () => {
    const parsed = parseAdminCrmEmailBody({
      to: "  Guest@X.com ",
      toName: "Guest",
      subject: "Come back",
      body: "Hi <script>alert(1)</script>\n\nSee you on the lake.",
    });
    assert.ok(!("error" in parsed));
    if ("error" in parsed) return;
    assert.strictEqual(parsed.to, "guest@x.com");
    const html = adminCrmEmailToHtml(parsed.body);
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(!html.includes("<script>alert"));
    assert.ok(html.includes("See you on the lake."));
  });
});

describe("activity helpers", () => {
  it("titles known email templates", () => {
    assert.strictEqual(activityTitleForEmailLog("admin_crm_email"), "Email from admin");
    assert.strictEqual(activityTitleForEmailLog("booking_confirmation"), "Confirmation email");
    assert.strictEqual(activityTitleForEmailLog("booking_confirmation", "sms"), "Confirmation SMS");
  });

  it("sorts newest first", () => {
    const items: CustomerActivityItem[] = [
      { id: "a", type: "email", at: "2026-01-01T00:00:00.000Z", title: "old" },
      { id: "b", type: "email", at: "2026-06-01T00:00:00.000Z", title: "new" },
    ];
    assert.deepStrictEqual(sortActivityNewestFirst(items).map((x) => x.id), ["b", "a"]);
  });
});
