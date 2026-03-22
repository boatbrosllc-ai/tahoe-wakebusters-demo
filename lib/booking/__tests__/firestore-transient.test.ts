/**
 * Ensures transient Firestore/gRPC signals map to retryable 503 classification (create-hold catch).
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import { isTransientFirestoreFailure } from "../firestore-transient";

describe("isTransientFirestoreFailure", () => {
  it("returns true for gRPC UNAVAILABLE code 14", () => {
    assert.strictEqual(isTransientFirestoreFailure(Object.assign(new Error("x"), { code: 14 })), true);
  });

  it("returns true for DEADLINE_EXCEEDED code 4", () => {
    assert.strictEqual(isTransientFirestoreFailure(Object.assign(new Error("deadline"), { code: 4 })), true);
  });

  it("returns false for user-facing slot copy", () => {
    assert.strictEqual(isTransientFirestoreFailure(new Error("Slot no longer available")), false);
  });

  it("returns true for ECONNRESET message", () => {
    assert.strictEqual(isTransientFirestoreFailure(new Error("read ECONNRESET")), true);
  });

  it("returns false for unrelated business errors", () => {
    assert.strictEqual(isTransientFirestoreFailure(new Error("Discount code invalid")), false);
  });
});
