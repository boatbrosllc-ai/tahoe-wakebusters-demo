import { schedule } from "@netlify/functions";

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

  try {
    const res = await fetch(`${baseUrl}/api/booking/final-payment-reminder-cron`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    });

    const body = await res.json().catch(() => ({}));
    console.log(`[final-payment-reminder-cron] Response status: ${res.status}`, body);

    return { statusCode: 200 };
  } catch (err) {
    console.error("[final-payment-reminder-cron] Fetch error:", err);
    return { statusCode: 500 };
  }
});
