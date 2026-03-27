import { schedule } from "@netlify/functions";

const FETCH_TIMEOUT_MS = 50_000; // under 60s function timeout

export const handler = schedule("*/2 * * * *", async () => {
  const rawBase =
    process.env.APP_BASE_URL ?? process.env.URL;
  const cronSecret = process.env.CRON_SECRET;

  if (!rawBase) {
    console.error("[process-confirmation-outbox] Missing env var: APP_BASE_URL (or URL)");
    return { statusCode: 500 };
  }

  if (!cronSecret) {
    console.error("[process-confirmation-outbox] Missing env var: CRON_SECRET");
    return { statusCode: 500 };
  }

  const baseUrl = rawBase.replace(/\/$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/admin/cron/process-confirmation-outbox`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "X-Cron-Timestamp": String(Math.floor(Date.now() / 1000)),
      },
      signal: controller.signal,
    });

    const body = await res.json().catch(() => ({}));
    console.log(`[process-confirmation-outbox] Response status: ${res.status}`, body);

    // API must return 200 so this scheduled run is healthy and Netlify reports success.
    if (res.status !== 200) {
      console.error(`[process-confirmation-outbox] Expected 200 from cron route, got ${res.status}`);
      return { statusCode: 500 };
    }
    return { statusCode: 200 };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[process-confirmation-outbox] Fetch aborted after timeout (50s)");
      return { statusCode: 504 };
    }
    console.error("[process-confirmation-outbox] Fetch error:", err);
    return { statusCode: 500 };
  } finally {
    clearTimeout(timeoutId);
  }
});
