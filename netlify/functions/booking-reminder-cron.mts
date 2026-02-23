import { schedule } from "@netlify/functions";

export const handler = schedule("0 * * * *", async () => {
  const rawBase =
    process.env.APP_BASE_URL ?? process.env.URL;
  const cronSecret = process.env.CRON_SECRET;

  if (!rawBase) {
    console.error("[booking-reminder-cron] Missing env var: APP_BASE_URL (or URL)");
    return { statusCode: 500 };
  }

  if (!cronSecret) {
    console.error("[booking-reminder-cron] Missing env var: CRON_SECRET");
    return { statusCode: 500 };
  }

  const baseUrl = rawBase.replace(/\/$/, "");

  try {
    const res = await fetch(`${baseUrl}/api/booking/reminder-cron`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    });

    const body = await res.json().catch(() => ({}));
    console.log(`[booking-reminder-cron] Response status: ${res.status}`, body);

    return { statusCode: 200 };
  } catch (err) {
    console.error("[booking-reminder-cron] Fetch error:", err);
    return { statusCode: 500 };
  }
});
