/**
 * Rate limiter for booking endpoints.
 * - Client identity: derived from trusted platform-set headers only (x-real-ip,
 *   x-nf-client-connection-ip). On Netlify, falls back to the first x-forwarded-for
 *   hop when those are missing. Does not use x-forwarded-for off-Netlify (spoofing).
 * - Store: when RATE_LIMIT_REDIS_REST_URL and RATE_LIMIT_REDIS_REST_TOKEN (or
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) are set, uses Redis so
 *   limits persist across instances and cold starts.
 * - Degraded mode (production-safe): When Redis is unavailable (error or timeout),
 *   policy is controlled by env. In production, RATE_LIMIT_DEGRADED_USE_MEMORY defaults to on
 *   (set to 0 to disable); uses in-memory fallback with stricter limit (see MAX_REQUESTS_MEMORY_FALLBACK).
 *   Fail-open without memory fallback only when degraded memory is off. Set RATE_LIMIT_FAIL_CLOSED=1 to reject
 *   with 503 when Redis is down. For create-hold / create-payment-intent, also set RATE_LIMIT_MUTATION_FAIL_CLOSED=1
 *   to fail closed on Redis errors for those routes only.
 * - When Redis is not configured in production, most rate-limited endpoints return 503; post-payment routes use
 *   `checkRateLimitPostPayment` and fall back to in-memory limiting instead.
 *
 * **Which function for which routes (do not swap casually):**
 * `checkRateLimit` — general mutations; `checkRateLimitSensitiveMutation` — create-hold / create-payment-intent /
 * create-checkout-session-direct; `checkRateLimitPublicRead` — availability GETs; `checkRateLimitValidateDiscount`
 * — validate-discount; `checkRateLimitPostPayment` — complete-after-payment, receipt, release-hold.
 */

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 30; // per window per key (Redis)
/**
 * Public GET availability (date-prices, slots, effective-price): separate bucket so calendar prefetch
 * does not share the 30/min budget with checkout/hold mutations.
 */
const MAX_REQUESTS_PUBLIC_READ = 180;
const MAX_REQUESTS_PUBLIC_READ_UNKNOWN = 90;
/** Local dev: every request looks like `*:unknown` (no x-real-ip). Calendar + date-prices + HMR/Strict Mode can exceed the unknown bucket; do not throttle dev like anonymous prod traffic. */
const MAX_REQUESTS_PUBLIC_READ_DEV = 10_000;
/** Shared "unknown" IP bucket (Redis) when proxy headers are missing — aligned with known-IP limit; mutation routes use stricter checks via `RATE_LIMIT_MUTATION_FAIL_CLOSED`. */
const MAX_REQUESTS_UNKNOWN_BUCKET = 30;
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
 * x-nf-client-connection-ip). On Netlify, fall back to the first
 * x-forwarded-for hop when those are missing (Netlify sets/appends the
 * connection IP). Fallback is "unknown"; raw x-forwarded-for is not used
 * off-Netlify to avoid spoofing.
 */
export function getClientKey(request: Request): string {
  const xRealIp = request.headers.get("x-real-ip");
  const nfConnIp = request.headers.get("x-nf-client-connection-ip");
  let ip = (xRealIp ?? nfConnIp ?? "").trim();

  // Netlify Next runtime sometimes omits x-nf-client-connection-ip on App Router
  // handlers while still providing x-forwarded-for. Prefer that over a shared
  // "unknown" bucket that starves calendar reads for every visitor.
  if (!ip && isNetlifyRuntime()) {
    const xff = request.headers.get("x-forwarded-for");
    const first = xff?.split(",")[0]?.trim() ?? "";
    if (first && isPlausibleIp(first)) ip = first;
  }

  if (!ip) ip = "unknown";

  if (ip === "unknown" && process.env.NODE_ENV === "production") {
    if (!unknownIpWarned) {
      unknownIpWarned = true;
      console.warn("[rate-limit] Client IP could not be determined (x-real-ip and x-nf-client-connection-ip missing or empty). All such clients share the same bucket; consider configuring your proxy to set a trusted IP header.");
      void import("@/lib/booking/operational-alerts")
        .then(({ writeOperationalAlert }) =>
          writeOperationalAlert({
            type: "rate_limit_unknown_ip",
            source: "getClientKey",
            message:
              "Client IP could not be determined; all unknown clients share one rate-limit bucket. Configure x-real-ip or x-nf-client-connection-ip on the proxy.",
          }),
        )
        .catch(() => {});
    }
  }
  return `booking:${ip}`;
}

function isNetlifyRuntime(): boolean {
  return (
    process.env.NETLIFY === "true" ||
    Boolean(process.env.CONTEXT?.trim()) ||
    Boolean(process.env.NETLIFY_DEV?.trim())
  );
}

/** Reject obvious non-IP spoof values before using XFF on Netlify. */
function isPlausibleIp(value: string): boolean {
  // IPv4
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) return true;
  // Rough IPv6 (includes compressed forms)
  if (value.includes(":") && /^[0-9a-fA-F:]+$/.test(value)) return true;
  return false;
}

/**
 * Token-aware rate limit key for manage-booking routes. Use after token verification.
 * Keys by bookingId so one abusive source cannot starve legitimate users sharing IP.
 */
export function getManageRateLimitKey(bookingId: string): string {
  return `manage:token:${bookingId}`;
}

/** Per-hold key for complete-after-payment polling so shared-IP traffic does not throttle a single booking. */
export function getHoldRateLimitKey(holdId: string): string {
  return `complete:hold:${holdId}`;
}

/** Rate limit key for bulk calendar.ics feed (token prefix only; avoids sharing IP bucket with unrelated traffic). */
export function getCalendarFeedTokenRateLimitKey(tokenPrefix: string): string {
  return `calendar:feed:${tokenPrefix}`;
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
  const useMemoryFallback =
    process.env.NODE_ENV === "production"
      ? process.env.RATE_LIMIT_DEGRADED_USE_MEMORY !== "0"
      : process.env.RATE_LIMIT_DEGRADED_USE_MEMORY === "1";
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
    if (process.env.NODE_ENV !== "production") {
      return MAX_REQUESTS_PUBLIC_READ_DEV;
    }
    return unknown ? MAX_REQUESTS_PUBLIC_READ_UNKNOWN : MAX_REQUESTS_PUBLIC_READ;
  }
  return unknown ? MAX_REQUESTS_UNKNOWN_BUCKET : MAX_REQUESTS;
}

function redisKeyFor(kind: RateLimitKind, key: string, windowStart: number): string {
  const ns = kind === "publicRead" ? RATE_LIMIT_REDIS_PREFIX_PUBLIC_READ : "rl:";
  return `${ns}${key}:${windowStart}`;
}

type RateLimitCoreOpts = {
  mutationSensitive?: boolean;
  /** When true and Redis is unset in production, use in-memory limiting instead of failing closed (post-payment paths). */
  postPaymentAllowMemoryWithoutRedis?: boolean;
};

async function checkRateLimitCore(kind: RateLimitKind, key: string, opts?: RateLimitCoreOpts): Promise<RateLimitResult> {
  const redis = getRedisConfig();
  const isProduction = process.env.NODE_ENV === "production";
  const useMemoryFallback =
    process.env.NODE_ENV === "production"
      ? process.env.RATE_LIMIT_DEGRADED_USE_MEMORY !== "0"
      : process.env.RATE_LIMIT_DEGRADED_USE_MEMORY === "1";
  const windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
  const redisKey = redis ? redisKeyFor(kind, key, windowStart) : null;

  if (isProduction && !redis && !opts?.postPaymentAllowMemoryWithoutRedis) {
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
        const mutationFailClosed = opts?.mutationSensitive === true && process.env.RATE_LIMIT_MUTATION_FAIL_CLOSED === "1";
        const failClosed = process.env.RATE_LIMIT_FAIL_CLOSED === "1" || mutationFailClosed;
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

/** Same as checkRateLimit but Redis outage can fail closed when RATE_LIMIT_MUTATION_FAIL_CLOSED=1 (create-hold / create-payment-intent). */
export async function checkRateLimitSensitiveMutation(key: string): Promise<RateLimitResult> {
  return checkRateLimitCore("default", key, { mutationSensitive: true });
}

/** Rate limit for idempotent public availability GETs (slots, date-prices, effective-price). Separate from mutation budget. */
export async function checkRateLimitPublicRead(key: string): Promise<RateLimitResult> {
  return checkRateLimitCore("publicRead", key);
}

/**
 * Post-payment customer-critical paths: complete-after-payment, receipt, release-hold.
 * Same bucket as `checkRateLimit` when Redis is configured; in production without Redis, uses in-memory limiting
 * instead of 503 so paid users are not stranded.
 */
export async function checkRateLimitPostPayment(key: string): Promise<RateLimitResult> {
  return checkRateLimitCore("default", key, { postPaymentAllowMemoryWithoutRedis: true });
}
