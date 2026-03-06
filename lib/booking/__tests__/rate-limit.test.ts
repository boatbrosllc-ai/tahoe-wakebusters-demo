/**
 * Unit tests for booking rate limiter: client key derivation and limit behavior.
 * Covers getClientKey (trusted headers only) and checkRateLimit (in-memory path in dev).
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { getClientKey, checkRateLimit, type RateLimitResult } from "../rate-limit";

describe("getClientKey", () => {
  it("prefers x-real-ip when set", () => {
    const req = new Request("https://example.com", {
      headers: { "x-real-ip": "192.168.1.1", "x-nf-client-connection-ip": "10.0.0.1" },
    });
    assert.strictEqual(getClientKey(req), "booking:192.168.1.1");
  });

  it("falls back to x-nf-client-connection-ip when x-real-ip missing", () => {
    const req = new Request("https://example.com", {
      headers: { "x-nf-client-connection-ip": "10.0.0.2" },
    });
    assert.strictEqual(getClientKey(req), "booking:10.0.0.2");
  });

  it("returns booking:unknown when no trusted headers", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    assert.strictEqual(getClientKey(req), "booking:unknown");
  });

  it("trims whitespace from IP", () => {
    const req = new Request("https://example.com", {
      headers: { "x-real-ip": "  203.0.113.5  " },
    });
    assert.strictEqual(getClientKey(req), "booking:203.0.113.5");
  });
});

describe("checkRateLimit", () => {
  const origEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = origEnv;
  });

  it("allows first request in dev (in-memory)", async () => {
    process.env.NODE_ENV = "development";
    const key = `test:${Date.now()}:${Math.random()}`;
    const r = await checkRateLimit(key);
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.retryAfterMs, undefined);
  });

  it("allows up to limit in dev then denies with retryAfterMs", async () => {
    process.env.NODE_ENV = "development";
    const key = `test:limit:${Date.now()}`;
    const limit = 30;
    let result: RateLimitResult = { allowed: true };
    for (let i = 0; i < limit; i++) {
      result = await checkRateLimit(key);
      assert.strictEqual(result.allowed, true, `request ${i + 1} should be allowed`);
    }
    result = await checkRateLimit(key);
    assert.strictEqual(result.allowed, false);
    assert.ok(typeof result.retryAfterMs === "number" && result.retryAfterMs >= 0);
  });

  it("fails closed in production when Redis not configured", async () => {
    process.env.NODE_ENV = "production";
    const key = `test:prod:${Date.now()}`;
    const r = await checkRateLimit(key);
    assert.strictEqual(r.allowed, false);
    assert.ok(typeof r.retryAfterMs === "number" && r.retryAfterMs > 0);
  });
});
