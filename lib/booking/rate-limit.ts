/**
 * Simple in-memory rate limiter for booking endpoints.
 * Limits requests per key (e.g. IP) per window. For multi-instance deployments
 * consider Redis or Vercel KV; this is effective for single-instance or low traffic.
 */

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 30; // per window per key

const store = new Map<string, { count: number; resetAt: number }>();

function prune(): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

export function checkRateLimit(key: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  if (store.size > 10000) prune();

  let entry = store.get(key);
  if (!entry) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }
  if (entry.resetAt <= now) {
    entry = { count: 1, resetAt: now + WINDOW_MS };
    store.set(key, entry);
    return { allowed: true };
  }
  entry.count++;
  if (entry.count <= MAX_REQUESTS) return { allowed: true };
  return { allowed: false, retryAfterMs: Math.max(0, entry.resetAt - now) };
}

export function getClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : request.headers.get("x-real-ip") ?? "unknown";
  return `booking:${ip}`;
}
