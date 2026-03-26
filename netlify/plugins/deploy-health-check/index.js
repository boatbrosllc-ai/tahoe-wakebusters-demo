/**
 * Post-deploy: GET /api/health should show core integrations ready (Firebase, Stripe, booking runtime).
 * Production deploys fail when GA4 is disabled (`ga4.enabled === false`).
 * Does not fail the deploy for optional / follow-up config: Redis rate-limit, release/receipt signing secrets
 * (those can be added without blocking publishes — see /api/health and Netlify env).
 */

function isNetlifyProductionContext() {
  return process.env.CONTEXT === "production";
}

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

  if (isNetlifyProductionContext() && json.ga4?.enabled !== true) {
    throw new Error(
      `[deploy-health-check] GA4 must be enabled in production (health ga4.enabled is not true). Set NEXT_PUBLIC_GA_MEASUREMENT_ID on Netlify. Body: ${text.slice(0, 500)}`
    );
  }

  const criticalDegraded =
    json.firebase === "not_configured" ||
    json.stripe === "not_configured" ||
    json.bookingReady === "degraded" ||
    json.legacyFallbackSafe === "degraded";

  const optionalDegraded =
    json.rateLimit === "degraded" ||
    json.rateLimitReady === false ||
    json.releaseTokenSecret === "not_configured" ||
    json.receiptTokenSecret === "not_configured";

  if (res.ok && json.status === "ok") {
    if (json.rateLimit === "degraded" || json.rateLimitReady === false) {
      console.warn(
        "[deploy-health-check] Rate limit is degraded (Redis may be unset). Configure UPSTASH_REDIS_REST_URL / TOKEN for production."
      );
    }
    console.log("[deploy-health-check] OK", { url });
    return;
  }

  if (criticalDegraded) {
    throw new Error(
      `[deploy-health-check] Critical integration or booking readiness degraded: ${text.slice(0, 500)}`
    );
  }

  if (res.status === 503 && optionalDegraded) {
    const parts = [];
    if (json.rateLimit === "degraded" || json.rateLimitReady === false) {
      parts.push("Redis / rate limit (set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN)");
    }
    if (json.releaseTokenSecret === "not_configured") {
      parts.push("RELEASE_TOKEN_SECRET");
    }
    if (json.receiptTokenSecret === "not_configured") {
      parts.push("receipt signing (RECEIPT_* / MANAGE_BOOKING_SECRET as documented)");
    }
    console.warn(
      `[deploy-health-check] Deploy is live; health is degraded (non-blocking): ${parts.join("; ") || "see response"}. Full: ${text.slice(0, 400)}`
    );
    console.log("[deploy-health-check] OK (warnings only)", { url });
    return;
  }

  throw new Error(`[deploy-health-check] HTTP ${res.status} from ${url}: ${text.slice(0, 500)}`);
};
