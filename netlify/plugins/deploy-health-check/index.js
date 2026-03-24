/**
 * Post-deploy: GET /api/health must return 200 with status "ok" (secrets, legacy flags, booking readiness).
 * Fails the deploy if the site reports degraded (Redis missing still marks rate limit degraded — expected until Redis is set).
 */

export const onSuccess = async () => {
  const base =
    process.env.DEPLOY_PRIME_URL?.replace(/\/$/, "") ||
    process.env.URL?.replace(/\/$/, "") ||
    process.env.DEPLOY_URL?.replace(/\/$/, "");
  if (!base) {
    console.warn("[deploy-health-check] No DEPLOY_PRIME_URL/URL; skipping health check.");
    return;
  }
  const url = `${base}/api/health`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`[deploy-health-check] Non-JSON from ${url}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`[deploy-health-check] HTTP ${res.status} from ${url}: ${text.slice(0, 500)}`);
  }
  if (json.status !== "ok") {
    throw new Error(`[deploy-health-check] status is not ok: ${JSON.stringify(json)}`);
  }
  if (json.firebase === "not_configured" || json.stripe === "not_configured") {
    throw new Error(`[deploy-health-check] Critical integration degraded: ${JSON.stringify({ firebase: json.firebase, stripe: json.stripe })}`);
  }
  if (json.rateLimit === "degraded" || json.rateLimitReady === false) {
    console.warn(
      "[deploy-health-check] Rate limit is degraded (Redis may be unset). Configure UPSTASH_REDIS_REST_URL / TOKEN for production."
    );
  }
  if (json.bookingReady === "degraded" || json.legacyFallbackSafe === "degraded") {
    throw new Error(`[deploy-health-check] Booking readiness degraded: ${JSON.stringify(json)}`);
  }
  console.log("[deploy-health-check] OK", { url });
};
