import { schedule } from "@netlify/functions";

const FETCH_TIMEOUT_MS = 50_000; // 10s under 60s function timeout

export const handler = schedule("*/30 * * * *", async () => {
  // Runs every 30 minutes to reduce max charge delay from ~4h to ~30 min past finalChargeAt
  const rawBase =
    process.env.APP_BASE_URL ?? process.env.URL;
  const cronSecret = process.env.CRON_SECRET;

  if (!rawBase) {
    console.error("[run-final-charges] Missing env var: APP_BASE_URL (or URL)");
    return { statusCode: 500 };
  }

  if (!cronSecret) {
    console.error("[run-final-charges] Missing env var: CRON_SECRET");
    return { statusCode: 500 };
  }

  const baseUrl = rawBase.replace(/\/$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/admin/cron/run-final-charges`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
      signal: controller.signal,
    });

    const body = await res.json().catch(() => ({}));
    console.log(`[run-final-charges] Response status: ${res.status}`, body);

    if (!res.ok) {
      return { statusCode: 500 };
    }
    return { statusCode: 200 };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[run-final-charges] Fetch aborted after timeout (50s)");
      return { statusCode: 504 };
    }
    console.error("[run-final-charges] Fetch error:", err);
    return { statusCode: 500 };
  } finally {
    clearTimeout(timeoutId);
  }
});
