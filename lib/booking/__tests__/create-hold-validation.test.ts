import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCreateHoldBody } from "../create-hold-validation";

describe("parseCreateHoldBody", () => {
  it("rejects non-object body", () => {
    const r = parseCreateHoldBody(null);
    assert.equal(r.input, null);
    assert.ok(r.hint?.includes("JSON object"));
  });

  it("accepts minimal valid charter-shaped body", () => {
    const r = parseCreateHoldBody({
      experienceId: "exp1",
      slotId: "slot1",
      rateId: "rate1",
      partySize: 2,
      customerDraft: { name: "A B", email: "a@b.co", phone: "+15125551234" },
      bookingMode: "charter",
    });
    assert.ok(r.input);
    assert.equal(r.input!.experienceId, "exp1");
    assert.equal(r.input!.partySize, 2);
  });

  it("rejects invalid bookingMode when key is present", () => {
    const r = parseCreateHoldBody({
      experienceId: "exp1",
      slotId: "slot1",
      rateId: "rate1",
      partySize: 2,
      customerDraft: { name: "A B", email: "a@b.co", phone: "+15125551234" },
      bookingMode: "solo",
    });
    assert.equal(r.input, null);
    assert.ok(r.hint?.includes("bookingMode"));
  });

  it("omits bookingMode from input when not sent", () => {
    const r = parseCreateHoldBody({
      experienceId: "exp1",
      slotId: "slot1",
      rateId: "rate1",
      partySize: 2,
      customerDraft: { name: "A B", email: "a@b.co", phone: "+15125551234" },
    });
    assert.ok(r.input);
    assert.equal(r.input!.bookingMode, undefined);
  });
});
