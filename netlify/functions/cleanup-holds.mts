import { schedule } from "@netlify/functions";

export const handler = schedule("*/30 * * * *", async () => {
  const rawBase =
    process.env.APP_BASE_URL ?? process.env.URL;
  const cronSecret = process.env.CRON_SECRET;

  if (!rawBase) {
    console.error("[cleanup-holds] Missing env var: APP_BASE_URL (or URL)");
    return { statusCode: 500 };
  }

  if (!cronSecret) {
    console.error("[cleanup-holds] Missing env var: CRON_SECRET");
    return { statusCode: 500 };
  }

  const baseUrl = rawBase.replace(/\/$/, "");

  try {
    const res = await fetch(`${baseUrl}/api/booking/cleanup-holds`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    });

    const body = await res.json().catch(() => ({}));
    console.log(`[cleanup-holds] Response status: ${res.status}`, body);

    if (!res.ok) {
      return { statusCode: 500 };
    }
    return { statusCode: 200 };
  } catch (err) {
    console.error("[cleanup-holds] Fetch error:", err);
    return { statusCode: 500 };
  }
});
