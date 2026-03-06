/**
 * Rate limiter for booking endpoints.
 * - Client identity: derived from trusted platform-set headers only (x-real-ip,
 *   x-nf-client-connection-ip). Does not use x-forwarded-for to avoid spoofing.
 * - Store: when RATE_LIMIT_REDIS_REST_URL and RATE_LIMIT_REDIS_REST_TOKEN (or
 *   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) are set, uses Redis so
 *   limits persist across instances and cold starts. In production, a shared
 *   store is required; if Redis is not configured in production we fail closed
 *   (reject with rate limit) so in-memory fallback is not used cluster-wide.
 */

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 30; // per window per key

const memoryStore = new Map<string, { count: number; resetAt: number }>();

function pruneMemory(): void {
  const now = Date.now();
  Array.from(memoryStore.entries()).forEach(([key, entry]) => {
    if (entry.resetAt <= now) memoryStore.delete(key);
  });
}

/**
 * Derive client key from trusted platform metadata only. Does not use
 * x-forwarded-for (spoofable). Prefers x-real-ip (Vercel/Netlify edge) and
 * x-nf-client-connection-ip (Netlify).
 */
export function getClientKey(request: Request): string {
  const xRealIp = request.headers.get("x-real-ip");
  const nfConnIp = request.headers.get("x-nf-client-connection-ip");
  const ip = (xRealIp ?? nfConnIp ?? "").trim() || "unknown";
  return `booking:${ip}`;
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
 * or Redis is configured (production requires Redis; otherwise we fail closed).
 */
export function isRateLimitReadyForProduction(): boolean {
  const redis = getRedisConfig();
  const isProduction = process.env.NODE_ENV === "production";
  if (!isProduction) return true;
  return redis !== null;
}

async function redisIncr(
  config: { url: string; token: string },
  key: string,
  ttlSeconds: number
): Promise<number> {
  const res = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["INCR", key]),
  });
  if (!res.ok) throw new Error("Redis INCR failed");
  const data = (await res.json()) as { result?: number };
  const count = typeof data.result === "number" ? data.result : 0;
  if (count === 1) {
    const ttlRes = await fetch(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["EXPIRE", key, ttlSeconds]),
    });
    if (!ttlRes.ok) {
      // best-effort; key will eventually expire
    }
  }
  return count;
}

export type RateLimitResult = { allowed: boolean; retryAfterMs?: number; serverError?: boolean };

/**
 * Check rate limit. When Redis config is set, uses Redis (async). In production
 * (NODE_ENV === "production") Redis is required; if not configured we fail closed
 * and treat as rate limited. In development, falls back to in-memory store when
 * Redis is not set.
 */
export async function checkRateLimit(key: string): Promise<RateLimitResult> {
  const redis = getRedisConfig();
  const isProduction = process.env.NODE_ENV === "production";
  const windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
  const redisKey = redis ? `rl:${key}:${windowStart}` : null;

  if (redis && redisKey) {
    try {
      const count = await redisIncr(redis, redisKey, Math.ceil(WINDOW_MS / 1000) + 60);
      if (count <= MAX_REQUESTS) return { allowed: true };
      const resetAt = windowStart + WINDOW_MS;
      return { allowed: false, retryAfterMs: Math.max(0, resetAt - Date.now()) };
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      console.error("[rate-limit] Redis unavailable:", errMessage);
      if (isProduction) {
        const failOpen = process.env.RATE_LIMIT_FAIL_OPEN === "1";
        if (failOpen) return { allowed: true };
        return { allowed: false, retryAfterMs: WINDOW_MS, serverError: true };
      }
      return { allowed: true }; // fail open in dev if Redis unavailable
    }
  }

  if (isProduction) {
    return { allowed: false, retryAfterMs: WINDOW_MS, serverError: true };
  }

  const now = Date.now();
  if (memoryStore.size > 10000) pruneMemory();

  let entry = memoryStore.get(key);
  if (!entry) {
    memoryStore.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }
  if (entry.resetAt <= now) {
    entry = { count: 1, resetAt: now + WINDOW_MS };
    memoryStore.set(key, entry);
    return { allowed: true };
  }
  entry.count++;
  if (entry.count <= MAX_REQUESTS) return { allowed: true };
  return { allowed: false, retryAfterMs: Math.max(0, entry.resetAt - now) };
}
