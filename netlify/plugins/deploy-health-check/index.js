/**
 * Post-deploy: GET /api/health should show core integrations ready (Firebase, Stripe, booking runtime).
 * Production deploys fail when GA4 is disabled (`ga4.enabled === false`).
 * Production deploys also run a browser synthetic analytics smoke test:
 * - GA loader present
 * - At least one successful analytics request on initial load
 * - At least one successful analytics request after client-side navigation
 * Does not fail the deploy for optional / follow-up config: Redis rate-limit, release/receipt signing secrets
 * (those can be added without blocking publishes — see /api/health and Netlify env).
 */

import { chromium } from "playwright";

function isNetlifyProductionContext() {
  return process.env.CONTEXT === "production";
}

const ANALYTICS_REQUEST_RE = /(google-analytics\.com|analytics\.google\.com)\/.*(?:collect|g\/collect|j\/collect)/i;
const GA_LOADER_RE = /googletagmanager\.com\/gtag\/js\?id=/i;

async function runAnalyticsSmoke(baseUrl) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  let phase = "initial";
  const hits = [];

  page.on("response", (response) => {
    const url = response.url();
    if (!ANALYTICS_REQUEST_RE.test(url)) return;
    const status = response.status();
    if (status >= 200 && status < 300) {
      hits.push({ phase, url, status });
    }
  });

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

    const loaderPresent = await page.evaluate((loaderPattern) => {
      const re = new RegExp(loaderPattern, "i");
      return Array.from(document.scripts).some((s) => re.test(s.src || ""));
    }, String(GA_LOADER_RE.source));

    if (!loaderPresent) {
      throw new Error("[deploy-health-check] GA smoke test failed: gtag loader script was not found in page scripts.");
    }

    await page.waitForTimeout(2500);
    const initialHits = hits.filter((h) => h.phase === "initial");
    if (initialHits.length === 0) {
      throw new Error("[deploy-health-check] GA smoke test failed: no successful analytics request observed on initial page load.");
    }

    const currentPath = new URL(page.url()).pathname;
    const navTarget = await page.evaluate((pathNow) => {
      const links = Array.from(document.querySelectorAll("a[href]"));
      for (const link of links) {
        const href = link.getAttribute("href");
        if (!href) continue;
        if (!href.startsWith("/")) continue;
        if (href === pathNow) continue;
        if (href.startsWith("/api/")) continue;
        if (href.startsWith("/_")) continue;
        if (href.startsWith("#")) continue;
        return href;
      }
      return null;
    }, currentPath);

    if (!navTarget) {
      throw new Error("[deploy-health-check] GA smoke test failed: no internal link found for client-side navigation probe.");
    }

    phase = "navigation";
    await Promise.all([
      page.waitForURL((url) => new URL(url).pathname !== currentPath, { timeout: 15_000 }),
      page.locator(`a[href="${navTarget}"]`).first().click({ timeout: 10_000 }),
    ]);
    await page.waitForTimeout(2500);

    const navHits = hits.filter((h) => h.phase === "navigation");
    if (navHits.length === 0) {
      throw new Error(
        `[deploy-health-check] GA smoke test failed: no successful analytics request observed after client-side navigation to ${navTarget}.`
      );
    }

    console.log("[deploy-health-check] GA synthetic smoke passed", {
      url: baseUrl,
      initialHits: initialHits.length,
      navigationHits: navHits.length,
    });
  } finally {
    await browser.close();
  }
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
    if (isNetlifyProductionContext()) {
      await runAnalyticsSmoke(base);
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
    if (isNetlifyProductionContext()) {
      await runAnalyticsSmoke(base);
    }
    console.log("[deploy-health-check] OK (warnings only)", { url });
    return;
  }

  throw new Error(`[deploy-health-check] HTTP ${res.status} from ${url}: ${text.slice(0, 500)}`);
};
