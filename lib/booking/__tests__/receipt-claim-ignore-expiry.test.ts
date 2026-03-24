/**
 * Receipt claim tokens are short-lived; ignore-expiry verification supports PI cross-check in receipt API.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  RECEIPT_CLAIM_MAX_STALE_SECONDS,
  signReceiptClaimToken,
  verifyReceiptClaimToken,
  verifyReceiptClaimTokenIgnoreExpiry,
} from "../receiptToken";

describe("verifyReceiptClaimTokenIgnoreExpiry", () => {
  it("returns payload when signature is valid but exp is in the past (verifyReceiptClaimToken rejects)", () => {
    const prev = process.env.RECEIPT_TOKEN_SECRET;
    process.env.RECEIPT_TOKEN_SECRET = "test-secret-for-receipt-claim-ignore-expiry";
    try {
      const holdId = "hold_rc_exp_test";
      const token = signReceiptClaimToken(holdId, Math.floor(Date.now() / 1000) - 3600);
      assert.ok(token);
      assert.strictEqual(verifyReceiptClaimToken(token!), null, "strict verify must reject expired");
      const stale = verifyReceiptClaimTokenIgnoreExpiry(token!);
      assert.ok(stale);
      assert.strictEqual(stale!.holdId, holdId);
    } finally {
      if (prev === undefined) delete process.env.RECEIPT_TOKEN_SECRET;
      else process.env.RECEIPT_TOKEN_SECRET = prev;
    }
  });

  it("rejects ignore-expiry when exp is older than max stale window", () => {
    const prev = process.env.RECEIPT_TOKEN_SECRET;
    process.env.RECEIPT_TOKEN_SECRET = "test-secret-rc-stale-window";
    try {
      const holdId = "hold_rc_too_old";
      const ancientExp = Math.floor(Date.now() / 1000) - RECEIPT_CLAIM_MAX_STALE_SECONDS - 3600;
      const token = signReceiptClaimToken(holdId, ancientExp);
      assert.ok(token);
      assert.strictEqual(verifyReceiptClaimTokenIgnoreExpiry(token!), null);
    } finally {
      if (prev === undefined) delete process.env.RECEIPT_TOKEN_SECRET;
      else process.env.RECEIPT_TOKEN_SECRET = prev;
    }
  });

  it("matches signReceiptClaimToken round-trip for non-expired token", () => {
    const prev = process.env.RECEIPT_TOKEN_SECRET;
    process.env.RECEIPT_TOKEN_SECRET = "test-secret-rc-roundtrip";
    try {
      const holdId = "hold_rc_ok";
      const token = signReceiptClaimToken(holdId);
      assert.ok(token);
      const a = verifyReceiptClaimToken(token!);
      const b = verifyReceiptClaimTokenIgnoreExpiry(token!);
      assert.ok(a && b);
      assert.strictEqual(a!.holdId, holdId);
      assert.strictEqual(b!.holdId, holdId);
    } finally {
      if (prev === undefined) delete process.env.RECEIPT_TOKEN_SECRET;
      else process.env.RECEIPT_TOKEN_SECRET = prev;
    }
  });
});
