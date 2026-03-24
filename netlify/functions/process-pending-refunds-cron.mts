import { schedule } from "@netlify/functions";

const FETCH_TIMEOUT_MS = 50_000;

export const handler = schedule("*/15 * * * *", async () => {
  const rawBase = process.env.APP_BASE_URL ?? process.env.URL;
  const cronSecret = process.env.CRON_SECRET;

  if (!rawBase) {
    console.error("[process-pending-refunds-cron] Missing env var: APP_BASE_URL (or URL)");
    return { statusCode: 500 };
  }
  if (!cronSecret) {
    console.error("[process-pending-refunds-cron] Missing env var: CRON_SECRET");
    return { statusCode: 500 };
  }

  const baseUrl = rawBase.replace(/\/$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/admin/cron/process-pending-refunds`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "X-Cron-Timestamp": String(Math.floor(Date.now() / 1000)),
      },
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    console.log(`[process-pending-refunds-cron] status ${res.status}`, body);
    return { statusCode: res.ok ? 200 : 500 };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[process-pending-refunds-cron] Fetch aborted after timeout");
      return { statusCode: 504 };
    }
    console.error("[process-pending-refunds-cron]", err);
    return { statusCode: 500 };
  } finally {
    clearTimeout(timeoutId);
  }
});
