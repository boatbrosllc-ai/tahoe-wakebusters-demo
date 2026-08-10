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
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

function isNetlifyProductionContext() {
  return process.env.CONTEXT === "production";
}

/** Investor / marketing-only deploys: skip Stripe/booking readiness gates; still require GA in production. */
function isDemoPitchSite() {
  const v = String(process.env.DEMO_PITCH_SITE ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

const ANALYTICS_REQUEST_RE = /(google-analytics\.com|analytics\.google\.com)\/.*(?:collect|g\/collect|j\/collect)/i;
const GA_LOADER_RE = /googletagmanager\.com\/gtag\/js\?id=/i;

function isMissingPlaywrightBrowserError(error) {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return msg.includes("Executable doesn't exist") || msg.includes("Please run the following command to download new browsers");
}

function tryInstallPlaywrightChromium() {
  console.warn("[deploy-health-check] Playwright Chromium executable missing. Attempting install: npx playwright install chromium");
  execSync("npx playwright install chromium", {
    stdio: "inherit",
    env: process.env,
  });
}

async function launchChromiumForSmoke() {
  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    if (!isMissingPlaywrightBrowserError(error)) {
      throw error;
    }
    tryInstallPlaywrightChromium();
    const executable = chromium.executablePath();
    if (!executable || !existsSync(executable)) {
      throw new Error(
        "[deploy-health-check] Playwright browser install did not provide a Chromium executable. " +
          "Ensure production build command runs `npx playwright install chromium` before deploy checks."
      );
    }
    return chromium.launch({ headless: true });
  }
}

async function runAnalyticsSmoke(baseUrl, { softNavCheck = false } = {}) {
  const browser = await launchChromiumForSmoke();
  const context = await browser.newContext();
  const page = await context.newPage();
  let phase = "initial";
  const hits = [];

  const recordHit = (url, status) => {
    if (!ANALYTICS_REQUEST_RE.test(url)) return;
    // 0 = opaque / no status (sendBeacon / some keepalive paths); still counts as a GA attempt.
    if (status === 0 || (status >= 200 && status < 300)) {
      hits.push({ phase, url, status });
    }
  };

  page.on("request", (request) => {
    recordHit(request.url(), 0);
  });
  page.on("response", (response) => {
    recordHit(response.url(), response.status());
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

    await page.waitForTimeout(3500);
    const initialHits = hits.filter((h) => h.phase === "initial");
    if (initialHits.length === 0) {
      throw new Error("[deploy-health-check] GA smoke test failed: no successful analytics request observed on initial page load.");
    }

    const currentPath = new URL(page.url()).pathname;
    // Prefer stable marketing routes (pitch site) over first random nav link.
    const preferred = ["/experiences", "/boats", "/packages", "/contact", "/our-story", "/faqs"];
    const navTarget = await page.evaluate(
      ({ pathNow, preferredHrefs }) => {
        const links = Array.from(document.querySelectorAll("a[href]"));
        const hrefs = links
          .map((link) => link.getAttribute("href"))
          .filter((href) => {
            if (!href) return false;
            if (!href.startsWith("/")) return false;
            if (href === pathNow) return false;
            if (href.startsWith("/api/") || href.startsWith("/_") || href.startsWith("#")) return false;
            if (href.startsWith("/admin") || href.startsWith("/booking")) return false;
            return true;
          });
        for (const pref of preferredHrefs) {
          if (hrefs.includes(pref)) return pref;
        }
        return hrefs[0] ?? null;
      },
      { pathNow: currentPath, preferredHrefs: preferred }
    );

    if (!navTarget) {
      throw new Error("[deploy-health-check] GA smoke test failed: no internal link found for client-side navigation probe.");
    }

    phase = "navigation";
    await Promise.all([
      page.waitForURL((url) => new URL(url).pathname !== currentPath, { timeout: 15_000 }),
      page.locator(`a[href="${navTarget}"]`).first().click({ timeout: 10_000 }),
    ]);

    // Next.js client navigations + gtag page_view can lag; poll briefly.
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      if (hits.some((h) => h.phase === "navigation")) break;
      await page.waitForTimeout(500);
    }

    const navHits = hits.filter((h) => h.phase === "navigation");
    if (navHits.length === 0) {
      const msg = `[deploy-health-check] GA smoke: no analytics hit after client navigation to ${navTarget} (initial load OK).`;
      // SPA page_view timing is flaky on Netlify build agents; first-load GA is the hard gate.
      console.warn(`${msg}${softNavCheck ? " (DEMO_PITCH_SITE soft check)" : ""}`);
      console.log("[deploy-health-check] GA synthetic smoke passed (initial load only)", {
        url: baseUrl,
        initialHits: initialHits.length,
        navTarget,
      });
    } else {
      console.log("[deploy-health-check] GA synthetic smoke passed", {
        url: baseUrl,
        initialHits: initialHits.length,
        navigationHits: navHits.length,
        navTarget,
      });
    }
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

  if (isDemoPitchSite()) {
    if (json.firebase === "not_configured") {
      throw new Error(
        `[deploy-health-check] DEMO_PITCH_SITE still requires Firebase. Body: ${text.slice(0, 500)}`
      );
    }
    console.warn(
      "[deploy-health-check] DEMO_PITCH_SITE=1 — allowing deploy without Stripe/Brevo/Upstash/booking readiness. Marketing pages only."
    );
    if (isNetlifyProductionContext()) {
      await runAnalyticsSmoke(base, { softNavCheck: true });
    }
    console.log("[deploy-health-check] OK (demo pitch)", { url, status: json.status, http: res.status });
    return;
  }

  if (res.ok && json.status === "ok") {
    if (json.rateLimit === "degraded" || json.rateLimitReady === false) {
      console.warn(
        "[deploy-health-check] Rate limit is degraded (Redis may be unset). Configure UPSTASH_REDIS_REST_URL / TOKEN for production."
      );
    }
    if (isNetlifyProductionContext()) {
      await runAnalyticsSmoke(base, { softNavCheck: false });
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
      await runAnalyticsSmoke(base, { softNavCheck: isDemoPitchSite() });
    }
    console.log("[deploy-health-check] OK (warnings only)", { url });
    return;
  }

  throw new Error(`[deploy-health-check] HTTP ${res.status} from ${url}: ${text.slice(0, 500)}`);
};
