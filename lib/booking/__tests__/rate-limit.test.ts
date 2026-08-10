/**
 * Unit tests for booking rate limiter: client key derivation and limit behavior.
 * Covers getClientKey (trusted headers only) and checkRateLimit (in-memory path in dev).
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import { getClientKey, checkRateLimit, checkRateLimitPublicRead, type RateLimitResult } from "../rate-limit";

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

  it("returns booking:unknown when neither x-real-ip nor x-nf-client-connection-ip is set (even if x-forwarded-for present off-Netlify)", () => {
    const prevNetlify = process.env.NETLIFY;
    const prevContext = process.env.CONTEXT;
    delete process.env.NETLIFY;
    delete process.env.CONTEXT;
    try {
      const req = new Request("https://example.com", {
        headers: { "x-forwarded-for": "1.2.3.4" },
      });
      assert.strictEqual(getClientKey(req), "booking:unknown");
    } finally {
      if (prevNetlify !== undefined) process.env.NETLIFY = prevNetlify;
      else delete process.env.NETLIFY;
      if (prevContext !== undefined) process.env.CONTEXT = prevContext;
      else delete process.env.CONTEXT;
    }
  });

  it("on Netlify uses first x-forwarded-for hop when trusted IP headers are missing", () => {
    const prevNetlify = process.env.NETLIFY;
    process.env.NETLIFY = "true";
    try {
      const req = new Request("https://example.com", {
        headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
      });
      assert.strictEqual(getClientKey(req), "booking:203.0.113.9");
    } finally {
      if (prevNetlify !== undefined) process.env.NETLIFY = prevNetlify;
      else delete process.env.NETLIFY;
    }
  });

  it("does not use x-forwarded-for for client key when x-real-ip is set (anti-spoofing: only trusted headers)", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "9.9.9.9", "x-real-ip": "192.168.1.10" },
    });
    assert.strictEqual(getClientKey(req), "booking:192.168.1.10");
  });

  it("returns booking:unknown when no IP headers present", () => {
    const req = new Request("https://example.com", { headers: {} });
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
    Reflect.set(process.env, "NODE_ENV", origEnv);
  });

  it("allows first request in dev (in-memory)", async () => {
    Reflect.set(process.env, "NODE_ENV", "development");
    const key = `test:${Date.now()}:${Math.random()}`;
    const r = await checkRateLimit(key);
    assert.strictEqual(r.allowed, true);
    assert.strictEqual(r.retryAfterMs, undefined);
  });

  it("allows up to limit in dev then denies with retryAfterMs", async () => {
    Reflect.set(process.env, "NODE_ENV", "development");
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

  it("returns 503 in production when Redis is not configured", async () => {
    Reflect.set(process.env, "NODE_ENV", "production");
    const key = `test:prod:${Date.now()}`;
    const r = await checkRateLimit(key);
    assert.strictEqual(r.allowed, false);
    assert.strictEqual(r.serverError, true);
  });
});

describe("checkRateLimitPublicRead", () => {
  const origEnv = process.env.NODE_ENV;

  afterEach(() => {
    Reflect.set(process.env, "NODE_ENV", origEnv);
  });

  it("allows a much higher public-read budget than mutations in dev (in-memory)", async () => {
    Reflect.set(process.env, "NODE_ENV", "development");
    const mutationKey = `test:mut:${Date.now()}`;
    for (let i = 0; i < 30; i++) {
      const r = await checkRateLimit(mutationKey);
      assert.strictEqual(r.allowed, true, `mutation ${i + 1}`);
    }
    assert.strictEqual((await checkRateLimit(mutationKey)).allowed, false);

    const pubKey = `test:pread:${Date.now()}`;
    for (let i = 0; i < 120; i++) {
      const r = await checkRateLimitPublicRead(pubKey);
      assert.strictEqual(r.allowed, true, `public read ${i + 1}`);
    }
    // Dev uses MAX_REQUESTS_PUBLIC_READ_DEV (10k) so calendar/HMR is not throttled like prod.
    assert.strictEqual((await checkRateLimitPublicRead(pubKey)).allowed, true);
  });
});
