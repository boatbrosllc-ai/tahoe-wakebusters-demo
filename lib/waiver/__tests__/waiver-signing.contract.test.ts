import { describe, it } from "node:test";
import assert from "node:assert";
import { readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

import {
  validateDobPolicyForTemplate,
  validateRequiredClauseInitialsForTemplate,
  validateSignerRequiredFieldsForTemplate,
  validateTermsAcceptanceForTemplate,
} from "../schema";

describe("waiver signing server-side validation", () => {
  it("enforces requiresInitials clauses", () => {
    const template = {
      clauses: [
        { id: "c1", label: "Clause 1", requiresInitials: true },
        { id: "c2", label: "Clause 2", requiresInitials: false },
      ],
    };
    const res = validateRequiredClauseInitialsForTemplate(template, { c2: "ABCD" });
    assert.strictEqual(res.ok, false);
  });

  it("enforces required signer fields (address + bookingDate)", () => {
    const template = {
      requiredFields: { dob: false, phone: false, address: true, bookingDate: true },
    };
    const res = validateSignerRequiredFieldsForTemplate(template, { address: "", bookingDate: "" });
    assert.strictEqual(res.ok, false);
    if (!res.ok) assert.match(res.message, /Address is required|Booking date is required/);
  });

  it("validates explicit terms acceptance metadata (hash mismatch rejects)", () => {
    const template = { termsHtml: "<p>terms</p>" };
    const expectedHash = createHash("sha256").update(template.termsHtml, "utf8").digest("hex");
    const res = validateTermsAcceptanceForTemplate(template, {
      termsAccepted: true,
      termsAcceptedAtIso: new Date().toISOString(),
      termsContentHash: expectedHash.slice(0, -1) + "0",
    });
    assert.strictEqual(res.ok, false);
  });

  it("rejects impossible DOB formats", () => {
    const template = {
      requiredFields: { dob: true, phone: true, address: false, bookingDate: true },
      dobMinAge: 18,
      dobMaxAge: undefined,
      minorAge: undefined,
    };
    const res = validateDobPolicyForTemplate(template, { dob: "2024-02-30" });
    assert.strictEqual(res.ok, false);
  });

  it("flags manual review when signer is under minorAge", () => {
    const now = new Date();
    const boundary = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    boundary.setUTCFullYear(boundary.getUTCFullYear() - 17);
    const dob = `${boundary.getUTCFullYear()}-${String(boundary.getUTCMonth() + 1).padStart(2, "0")}-${String(
      boundary.getUTCDate()
    ).padStart(2, "0")}`;
    const template = {
      requiredFields: { dob: false, phone: false, address: false, bookingDate: false },
      dobMinAge: undefined,
      dobMaxAge: undefined,
      minorAge: 18,
    };
    const res = validateDobPolicyForTemplate(template, { dob });
    assert.strictEqual(res.ok, true);
    if (res.ok) assert.ok(res.manualReview?.reasonCode.includes("minor") ?? false);
  });
});

describe("waiver signing submit route contracts", () => {
  const submitRouteSrc = readFileSync(
    join(__dirname, "../../../app/api/waiver/signing/submit/route.ts"),
    "utf8"
  );

  it("does not consume token when both artifacts fail (retryable 503)", () => {
    assert.match(submitRouteSrc, /Waiver document storage failed\. Please retry\./);
    assert.ok(
      submitRouteSrc.indexOf("Waiver document storage failed") <
        submitRouteSrc.indexOf("commitSingleUseTokenWaiverSign(token!, signed, templateSnapshotToPersist)"),
      "expected commitSingleUseTokenWaiverSign to occur after the retryable storage failure guard"
    );
  });

  it("rejects signing when signer identity mismatches in strict mode", () => {
    assert.match(submitRouteSrc, /waiver_signer_identity_mismatch_manual_review/);
    assert.match(submitRouteSrc, /Signer identity does not match the signing token\./);
  });

  it("hard-checks template version pinning drift", () => {
    assert.match(submitRouteSrc, /waiver_template_version_mismatch/);
    assert.match(submitRouteSrc, /status:\s*409/);
  });
});

