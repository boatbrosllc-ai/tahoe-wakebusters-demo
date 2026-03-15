import { schedule } from "@netlify/functions";

const FETCH_TIMEOUT_MS = 50_000; // 10s under 60s function timeout

export const handler = schedule("15 * * * *", async () => {
  const rawBase =
    process.env.APP_BASE_URL ?? process.env.URL;
  const cronSecret = process.env.CRON_SECRET;

  if (!rawBase) {
    console.error("[final-payment-reminder-cron] Missing env var: APP_BASE_URL (or URL)");
    return { statusCode: 500 };
  }

  if (!cronSecret) {
    console.error("[final-payment-reminder-cron] Missing env var: CRON_SECRET");
    return { statusCode: 500 };
  }

  const baseUrl = rawBase.replace(/\/$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/api/booking/final-payment-reminder-cron`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
      signal: controller.signal,
    });

    const body = await res.json().catch(() => ({}));
    console.log(`[final-payment-reminder-cron] Response status: ${res.status}`, body);

    if (!res.ok) {
      return { statusCode: 500 };
    }
    return { statusCode: 200 };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[final-payment-reminder-cron] Fetch aborted after timeout (50s)");
      return { statusCode: 504 };
    }
    console.error("[final-payment-reminder-cron] Fetch error:", err);
    return { statusCode: 500 };
  } finally {
    clearTimeout(timeoutId);
  }
});
