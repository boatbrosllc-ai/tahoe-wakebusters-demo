import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bookingAssignedToCaptain, readAssignedCaptain } from "../assigned-captain";

describe("assigned captain helpers", () => {
  it("reads nested assignment and normalizes email", () => {
    const assigned = readAssignedCaptain({
      captainEmail: "Alex@example.com",
      assignedCaptain: {
        email: "Alex@example.com",
        name: "Alex",
        assignedBy: "team@slipstack.io",
        assignedAt: "2026-03-22T18:00:00.000Z",
      },
    });
    assert.deepEqual(assigned, {
      email: "alex@example.com",
      name: "Alex",
      assignedAt: "2026-03-22T18:00:00.000Z",
      assignedBy: "team@slipstack.io",
    });
  });

  it("returns null when unassigned", () => {
    assert.equal(readAssignedCaptain({}), null);
    assert.equal(bookingAssignedToCaptain({}, "alex@example.com"), false);
  });

  it("matches the assigned captain email", () => {
    const b = { captainEmail: "alex@example.com" };
    assert.equal(bookingAssignedToCaptain(b, "Alex@example.com"), true);
    assert.equal(bookingAssignedToCaptain(b, "other@example.com"), false);
  });
});
