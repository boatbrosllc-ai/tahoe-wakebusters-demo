import { schedule } from "@netlify/functions";

const FETCH_TIMEOUT_MS = 50_000;

/** Every 15 minutes: apply pending PaymentIntent metadata patches from holds (best-effort sync after inline update failures). */
export const handler = schedule("*/15 * * * *", async () => {
  const rawBase = process.env.APP_BASE_URL ?? process.env.URL;
  const cronSecret = process.env.CRON_SECRET;

  if (!rawBase) {
    console.error("[reconcile-pending-pi-metadata] Missing env var: APP_BASE_URL (or URL)");
    return { statusCode: 500 };
  }

  if (!cronSecret) {
    console.error("[reconcile-pending-pi-metadata] Missing env var: CRON_SECRET");
    return { statusCode: 500 };
  }

  const baseUrl = rawBase.replace(/\/$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/admin/cron/reconcile-pending-pi-metadata`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "X-Cron-Timestamp": String(Math.floor(Date.now() / 1000)),
      },
      signal: controller.signal,
    });

    const body = await res.json().catch(() => ({}));
    console.log(`[reconcile-pending-pi-metadata] Response status: ${res.status}`, body);

    if (!res.ok) {
      return { statusCode: 500 };
    }

    return { statusCode: 200 };
  } catch (e) {
    console.error("[reconcile-pending-pi-metadata] fetch failed", e);
    return { statusCode: 500 };
  } finally {
    clearTimeout(timeoutId);
  }
});
