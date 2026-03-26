import { schedule } from "@netlify/functions";

const FETCH_TIMEOUT_MS = 50_000; // 10s under 60s function timeout

/**
 * Every 10 minutes: reconcile holds stuck with rollbackPending true past rollbackPendingExpiresAt.
 *
 * See POST /api/admin/cron/reconcile-rollback-pending-holds for server-side logic. This scheduled
 * function only forwards the cron call with Authorization and X-Cron-Timestamp headers.
 */
export const handler = schedule("*/10 * * * *", async () => {
  const rawBase = process.env.APP_BASE_URL ?? process.env.URL;
  const cronSecret = process.env.CRON_SECRET;

  if (!rawBase) {
    console.error("[reconcile-rollback-pending-holds] Missing env var: APP_BASE_URL (or URL)");
    return { statusCode: 500 };
  }

  if (!cronSecret) {
    console.error("[reconcile-rollback-pending-holds] Missing env var: CRON_SECRET");
    return { statusCode: 500 };
  }

  const baseUrl = rawBase.replace(/\/$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/admin/cron/reconcile-rollback-pending-holds`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "X-Cron-Timestamp": String(Math.floor(Date.now() / 1000)),
      },
      signal: controller.signal,
    });

    const body = await res.json().catch(() => ({}));
    console.log(`[reconcile-rollback-pending-holds] Response status: ${res.status}`, body);

    if (!res.ok) {
      return { statusCode: 500 };
    }
    return { statusCode: 200 };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[reconcile-rollback-pending-holds] Fetch aborted after timeout (50s)");
      return { statusCode: 504 };
    }
    console.error("[reconcile-rollback-pending-holds] Fetch error:", err);
    return { statusCode: 500 };
  } finally {
    clearTimeout(timeoutId);
  }
});

