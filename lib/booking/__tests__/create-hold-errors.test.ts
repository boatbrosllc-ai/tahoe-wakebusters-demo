import { describe, it } from "node:test";
import assert from "node:assert";
import {
  createHold503Payload,
  isRetryableCreateHold503Code,
} from "../create-hold-errors";

describe("create-hold 503 contract", () => {
  it("isRetryableCreateHold503Code matches retryable server codes", () => {
    assert.strictEqual(isRetryableCreateHold503Code("firestore_transient"), true);
    assert.strictEqual(isRetryableCreateHold503Code("rate_limit_unavailable"), true);
    assert.strictEqual(isRetryableCreateHold503Code("block_check_unavailable"), true);
    assert.strictEqual(isRetryableCreateHold503Code("firebase_config_unavailable"), false);
    assert.strictEqual(isRetryableCreateHold503Code(undefined), false);
  });

  it("createHold503Payload always includes error, code, incidentId", () => {
    const b = createHold503Payload("INC-AB", "firestore_transient", "Please retry");
    assert.deepStrictEqual(b, {
      error: "Please retry",
      code: "firestore_transient",
      incidentId: "INC-AB",
    });
  });
});
