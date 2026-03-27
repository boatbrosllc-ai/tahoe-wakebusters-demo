import { schedule } from "@netlify/functions";

const FETCH_TIMEOUT_MS = 50_000;

/**
 * Low-frequency auto-apply for shared departure inventory reconciliation.
 * POST /api/admin/cron/reconcile-departure-inventory?apply=true
 */
export const handler = schedule("0 * * * *", async () => {
  const rawBase = process.env.APP_BASE_URL ?? process.env.URL;
  const cronSecret = process.env.CRON_SECRET;

  if (!rawBase) {
    console.error("[reconcile-departure-inventory] Missing env var: APP_BASE_URL (or URL)");
    return { statusCode: 500 };
  }

  if (!cronSecret) {
    console.error("[reconcile-departure-inventory] Missing env var: CRON_SECRET");
    return { statusCode: 500 };
  }

  const baseUrl = rawBase.replace(/\/$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/admin/cron/reconcile-departure-inventory?apply=true`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "X-Cron-Timestamp": String(Math.floor(Date.now() / 1000)),
      },
      signal: controller.signal,
    });

    const body = await res.json().catch(() => ({}));
    console.log(`[reconcile-departure-inventory] Response status: ${res.status}`, body);

    if (!res.ok) {
      return { statusCode: 500 };
    }
    return { statusCode: 200 };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[reconcile-departure-inventory] Fetch aborted after timeout");
      return { statusCode: 504 };
    }
    console.error("[reconcile-departure-inventory] Fetch error:", err);
    return { statusCode: 500 };
  } finally {
    clearTimeout(timeoutId);
  }
});
