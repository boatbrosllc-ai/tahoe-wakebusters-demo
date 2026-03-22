/**
 * Rate limiter for booking endpoints.
 * - Client identity: derived from trusted platform-set headers only (x-real-ip,
 *   x-nf-client-connection-ip). Does not use x-forwarded-for to avoid spoofing.
 * - Store: when RATE_LIMIT_REDIS_REST_URL and RATE_LIMIT_REDIS_REST_TOKEN (or
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) are set, uses Redis so
 *   limits persist across instances and cold starts.
 * - Degraded mode (production-safe): When Redis is unavailable (error or timeout),
 *   policy is controlled by env. Default is fail-open (allow requests) so Redis
 *   outages do not hard-stop checkout. Set RATE_LIMIT_FAIL_CLOSED=1 to reject
 *   with 503 when Redis is down. Optional RATE_LIMIT_DEGRADED_USE_MEMORY=1 uses
 *   in-memory fallback with stricter limit (see MAX_REQUESTS_MEMORY_FALLBACK).
 * - When Redis is not configured in production, all rate-limited endpoints return 503 until Redis is configured.
 */

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 30; // per window per key (Redis)
/**
 * Public GET availability (date-prices, slots, effective-price): separate bucket so calendar prefetch
 * does not share the 30/min budget with checkout/hold mutations.
 */
const MAX_REQUESTS_PUBLIC_READ = 120;
const MAX_REQUESTS_PUBLIC_READ_UNKNOWN = 40;
/** Stricter limit for the shared "unknown" IP bucket (Redis) to reduce blast radius when proxy does not set IP headers. */
const MAX_REQUESTS_UNKNOWN_BUCKET = 10;
/** Stricter limit for validate-discount to reduce discount code enumeration via IP rotation. */
const MAX_REQUESTS_VALIDATE_DISCOUNT = 5;
/** Stricter limit when using in-memory fallback during Redis outage (RATE_LIMIT_DEGRADED_USE_MEMORY=1). */
const MAX_REQUESTS_MEMORY_FALLBACK = 10;
/** Timeout for Redis REST request; timeout is treated as Redis failure and flows through degraded policy. */
const REDIS_REQUEST_TIMEOUT_MS = 4000;

const memoryStore = new Map<string, { count: number; resetAt: number }>();

function pruneMemory(): void {
  const now = Date.now();
  Array.from(memoryStore.entries()).forEach(([key, entry]) => {
    if (entry.resetAt <= now) memoryStore.delete(key);
  });
}

let unknownIpWarned = false;

/**
 * Derive client key from trusted platform headers only (x-real-ip, then
 * x-nf-client-connection-ip). Fallback is "unknown"; x-forwarded-for is not
 * used to avoid spoofing. When the IP resolves to "unknown", a one-time
 * warning is logged in production and MAX_REQUESTS_UNKNOWN_BUCKET applies.
 */
export function getClientKey(request: Request): string {
  const xRealIp = request.headers.get("x-real-ip");
  const nfConnIp = request.headers.get("x-nf-client-connection-ip");
  const ip = (xRealIp ?? nfConnIp ?? "").trim() || "unknown";
  if (ip === "unknown" && process.env.NODE_ENV === "production") {
    if (!unknownIpWarned) {
      unknownIpWarned = true;
      console.warn("[rate-limit] Client IP could not be determined (x-real-ip and x-nf-client-connection-ip missing or empty). All such clients share the same bucket; consider configuring your proxy to set a trusted IP header.");
    }
  }
  return `booking:${ip}`;
}

/**
 * Token-aware rate limit key for manage-booking routes. Use after token verification.
 * Keys by bookingId so one abusive source cannot starve legitimate users sharing IP.
 */
export function getManageRateLimitKey(bookingId: string): string {
  return `manage:token:${bookingId}`;
}

function getRedisConfig(): { url: string; token: string } | null {
  const url =
    process.env.RATE_LIMIT_REDIS_REST_URL?.trim() ||
    process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token =
    process.env.RATE_LIMIT_REDIS_REST_TOKEN?.trim() ||
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  return { url, token };
}

/**
 * True when rate limiting is ready for production: either not in production (dev uses in-memory)
 * or Redis is configured. When Redis is missing in production, requests are rejected (503).
 */
export function isRateLimitReadyForProduction(): boolean {
  const redis = getRedisConfig();
  const isProduction = process.env.NODE_ENV === "production";
  if (!isProduction) return true;
  return redis !== null;
}

let loggedProductionRedisMissingCritical = false;

function rateLimitBlockedProductionNoRedis(): RateLimitResult {
  if (!loggedProductionRedisMissingCritical) {
    loggedProductionRedisMissingCritical = true;
    console.error(
      "[rate-limit] CRITICAL: NODE_ENV=production but Redis is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or RATE_LIMIT_REDIS_REST_URL and RATE_LIMIT_REDIS_REST_TOKEN). Booking endpoints return 503 until Redis is configured. See .env.example and SECURITY.md."
    );
  }
  return { allowed: false, retryAfterMs: 60_000, serverError: true, degraded: true };
}

type RedisFailureReason = "timeout" | "error";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("REDIS_TIMEOUT")), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId!));
}

async function redisIncr(
  config: { url: string; token: string },
  key: string,
  ttlSeconds: number
): Promise<number> {
  const baseUrl = config.url.replace(/\/$/, "");
  const pipelineUrl = `${baseUrl}/pipeline`;
  const headers = {
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
  };

  const run = async (): Promise<number> => {
    // Try pipeline first (single round-trip)
    const pipelineRes = await fetch(pipelineUrl, {
      method: "POST",
      headers,
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, ttlSeconds, "NX"],
      ]),
    });

    if (pipelineRes.ok) {
      const data = (await pipelineRes.json()) as Array<{ result?: number; error?: string }>;
      const incrResult = data[0];
      const count = typeof incrResult?.result === "number" ? incrResult.result : 0;
      return count;
    }

    const errBody = await pipelineRes.text();
    console.error("[rate-limit] Redis pipeline failed", {
      redisFailureReason: "error" as RedisFailureReason,
      status: pipelineRes.status,
      statusText: pipelineRes.statusText,
      body: errBody.slice(0, 300),
      urlHint: baseUrl.slice(0, 50),
    });

    // Fallback: two separate commands (some setups reject pipeline or EXPIRE NX)
    const incrRes = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(["INCR", key]),
    });
    if (!incrRes.ok) {
      const incrErr = await incrRes.text();
      console.error("[rate-limit] Redis INCR failed", {
        redisFailureReason: "error" as RedisFailureReason,
        status: incrRes.status,
        body: incrErr.slice(0, 200),
      });
      throw new Error(`Redis failed: ${incrRes.status}`);
    }
    const incrData = (await incrRes.json()) as { result?: number };
    const count = typeof incrData.result === "number" ? incrData.result : 0;
    if (count === 1) {
      await fetch(baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(["EXPIRE", key, ttlSeconds]),
      }).catch((e) => console.warn("[rate-limit] EXPIRE fallback failed", e));
    }
    return count;
  };

  try {
    return await withTimeout(run(), REDIS_REQUEST_TIMEOUT_MS);
  } catch (err) {
    const isTimeout = err instanceof Error && err.message === "REDIS_TIMEOUT";
    const reason: RedisFailureReason = isTimeout ? "timeout" : "error";
    console.error("[rate-limit] Redis request failed", {
      redisFailureReason: reason,
      key: key.slice(0, 60),
      message: err instanceof Error ? err.message : String(err),
    });
    const e = new Error(isTimeout ? "Redis request timeout" : "Redis unavailable");
    (e as Error & { redisFailureReason: RedisFailureReason }).redisFailureReason = reason;
    throw e;
  }
}

export type RateLimitResult = {
  allowed: boolean;
  retryAfterMs?: number;
  serverError?: boolean;
  /** True when request was allowed or limited using a fallback path (Redis down or not configured). Use for operational logging/alerting. */
  degraded?: boolean;
};

/** Key prefix for validate-discount endpoint so we can apply a stricter limit. */
export const RATE_LIMIT_KEY_PREFIX_VALIDATE_DISCOUNT = "booking:validate-discount:";

/**
 * Stricter rate limit for validate-discount (5 req/min per IP) to reduce discount code enumeration.
 * Use the same key as getClientKey(request) but with prefix RATE_LIMIT_KEY_PREFIX_VALIDATE_DISCOUNT.
 */
export async function checkRateLimitValidateDiscount(key: string): Promise<RateLimitResult> {
  const redis = getRedisConfig();
  const isProduction = process.env.NODE_ENV === "production";
  const useMemoryFallback = process.env.RATE_LIMIT_DEGRADED_USE_MEMORY === "1";
  const windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
  const redisKey = redis ? `rl:${RATE_LIMIT_KEY_PREFIX_VALIDATE_DISCOUNT}${key}:${windowStart}` : null;

  if (isProduction && !redis) {
    return rateLimitBlockedProductionNoRedis();
  }

  if (redis && redisKey) {
    try {
      const count = await redisIncr(redis, redisKey, Math.ceil(WINDOW_MS / 1000) + 60);
      const limit = key.endsWith(":unknown") ? Math.min(2, MAX_REQUESTS_VALIDATE_DISCOUNT) : MAX_REQUESTS_VALIDATE_DISCOUNT;
      if (count <= limit) return { allowed: true };
      const resetAt = windowStart + WINDOW_MS;
      return { allowed: false, retryAfterMs: Math.max(0, resetAt - Date.now()) };
    } catch (err) {
      const reason = (err as Error & { redisFailureReason?: RedisFailureReason }).redisFailureReason ?? "error";
      console.error("[rate-limit] Redis unavailable — validate-discount degraded policy", {
        redisFailureReason: reason,
        urlHint: redis.url.slice(0, 40),
      });
      if (isProduction) {
        /** Default fail-closed for discount enumeration when Redis errors; opt out with RATE_LIMIT_VALIDATE_DISCOUNT_DEGRADED_FAIL_OPEN=1 */
        const allowDegradedOpen = process.env.RATE_LIMIT_VALIDATE_DISCOUNT_DEGRADED_FAIL_OPEN === "1";
        const failClosed = process.env.RATE_LIMIT_FAIL_CLOSED === "1" || !allowDegradedOpen;
        if (failClosed) {
          return { allowed: false, retryAfterMs: WINDOW_MS, serverError: true, degraded: true };
        }
        if (useMemoryFallback) {
          const now = Date.now();
          if (memoryStore.size > 10000) pruneMemory();
          const memKey = `${RATE_LIMIT_KEY_PREFIX_VALIDATE_DISCOUNT}${key}`;
          let entry = memoryStore.get(memKey);
          if (!entry) {
            memoryStore.set(memKey, { count: 1, resetAt: now + WINDOW_MS });
            return { allowed: true, degraded: true };
          }
          if (entry.resetAt <= now) {
            entry = { count: 1, resetAt: now + WINDOW_MS };
            memoryStore.set(memKey, entry);
            return { allowed: true, degraded: true };
          }
          entry.count++;
          if (entry.count <= MAX_REQUESTS_VALIDATE_DISCOUNT) return { allowed: true, degraded: true };
          return { allowed: false, retryAfterMs: Math.max(0, entry.resetAt - now), degraded: true };
        }
        return { allowed: true, degraded: true };
      }
      return { allowed: true, degraded: true };
    }
  }

  const now = Date.now();
  if (memoryStore.size > 10000) pruneMemory();
  const memKey = `${RATE_LIMIT_KEY_PREFIX_VALIDATE_DISCOUNT}${key}`;
  let entry = memoryStore.get(memKey);
  if (!entry) {
    memoryStore.set(memKey, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }
  if (entry.resetAt <= now) {
    entry = { count: 1, resetAt: now + WINDOW_MS };
    memoryStore.set(memKey, entry);
    return { allowed: true };
  }
  entry.count++;
  if (entry.count <= MAX_REQUESTS_VALIDATE_DISCOUNT) return { allowed: true };
  return { allowed: false, retryAfterMs: Math.max(0, entry.resetAt - now) };
}

/** Redis namespace so public-read limits do not share the mutation bucket. */
const RATE_LIMIT_REDIS_PREFIX_PUBLIC_READ = "rl:pr:";

type RateLimitKind = "default" | "publicRead";

function limitForKey(kind: RateLimitKind, key: string): number {
  const unknown = key.endsWith(":unknown");
  if (kind === "publicRead") {
    return unknown ? MAX_REQUESTS_PUBLIC_READ_UNKNOWN : MAX_REQUESTS_PUBLIC_READ;
  }
  return unknown ? MAX_REQUESTS_UNKNOWN_BUCKET : MAX_REQUESTS;
}

function redisKeyFor(kind: RateLimitKind, key: string, windowStart: number): string {
  const ns = kind === "publicRead" ? RATE_LIMIT_REDIS_PREFIX_PUBLIC_READ : "rl:";
  return `${ns}${key}:${windowStart}`;
}

async function checkRateLimitCore(kind: RateLimitKind, key: string): Promise<RateLimitResult> {
  const redis = getRedisConfig();
  const isProduction = process.env.NODE_ENV === "production";
  const useMemoryFallback = process.env.RATE_LIMIT_DEGRADED_USE_MEMORY === "1";
  const windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
  const redisKey = redis ? redisKeyFor(kind, key, windowStart) : null;

  if (isProduction && !redis) {
    return rateLimitBlockedProductionNoRedis();
  }

  if (redis && redisKey) {
    try {
      const count = await redisIncr(redis, redisKey, Math.ceil(WINDOW_MS / 1000) + 60);
      const limit = limitForKey(kind, key);
      if (count <= limit) return { allowed: true };
      const resetAt = windowStart + WINDOW_MS;
      return { allowed: false, retryAfterMs: Math.max(0, resetAt - Date.now()) };
    } catch (err) {
      const reason = (err as Error & { redisFailureReason?: RedisFailureReason }).redisFailureReason ?? "error";
      console.error("[rate-limit] Redis unavailable — applying degraded policy", {
        redisFailureReason: reason,
        urlHint: redis.url.slice(0, 40),
      });
      if (isProduction) {
        const failClosed = process.env.RATE_LIMIT_FAIL_CLOSED === "1";
        if (failClosed) {
          return { allowed: false, retryAfterMs: WINDOW_MS, serverError: true, degraded: true };
        }
        if (useMemoryFallback) {
          // Bounded local fallback with stricter threshold
          const now = Date.now();
          if (memoryStore.size > 10000) pruneMemory();
          const memKey = `${kind}:${key}`;
          let entry = memoryStore.get(memKey);
          if (!entry) {
            memoryStore.set(memKey, { count: 1, resetAt: now + WINDOW_MS });
            console.warn("[rate-limit] DEGRADED_ALLOW memory_fallback", { key: key.slice(0, 50) });
            return { allowed: true, degraded: true };
          }
          if (entry.resetAt <= now) {
            entry = { count: 1, resetAt: now + WINDOW_MS };
            memoryStore.set(memKey, entry);
            console.warn("[rate-limit] DEGRADED_ALLOW memory_fallback", { key: key.slice(0, 50) });
            return { allowed: true, degraded: true };
          }
          entry.count++;
          const memLimit =
            kind === "publicRead"
              ? Math.min(MAX_REQUESTS_MEMORY_FALLBACK * 4, limitForKey(kind, key))
              : MAX_REQUESTS_MEMORY_FALLBACK;
          if (entry.count <= memLimit) {
            console.warn("[rate-limit] DEGRADED_ALLOW memory_fallback", { key: key.slice(0, 50), count: entry.count });
            return { allowed: true, degraded: true };
          }
          console.warn("[rate-limit] DEGRADED_LIMIT memory_fallback exceeded", { key: key.slice(0, 50), count: entry.count });
          return { allowed: false, retryAfterMs: Math.max(0, entry.resetAt - now), degraded: true };
        }
        console.warn("[rate-limit] DEGRADED_ALLOW fail_open", { key: key.slice(0, 50) });
        return { allowed: true, degraded: true };
      }
      console.warn("[rate-limit] DEGRADED_ALLOW fail_open (non-production)", { key: key.slice(0, 50) });
      return { allowed: true, degraded: true };
    }
  }

  const now = Date.now();
  if (memoryStore.size > 10000) pruneMemory();

  const memKey = `${kind}:${key}`;
  let entry = memoryStore.get(memKey);
  if (!entry) {
    memoryStore.set(memKey, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }
  if (entry.resetAt <= now) {
    entry = { count: 1, resetAt: now + WINDOW_MS };
    memoryStore.set(memKey, entry);
    return { allowed: true };
  }
  entry.count++;
  if (entry.count <= limitForKey(kind, key)) return { allowed: true };
  return { allowed: false, retryAfterMs: Math.max(0, entry.resetAt - now) };
}

export async function checkRateLimit(key: string): Promise<RateLimitResult> {
  return checkRateLimitCore("default", key);
}

/** Rate limit for idempotent public availability GETs (slots, date-prices, effective-price). Separate from mutation budget. */
export async function checkRateLimitPublicRead(key: string): Promise<RateLimitResult> {
  return checkRateLimitCore("publicRead", key);
}
