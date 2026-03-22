import { schedule } from "@netlify/functions";

async function ping(url: string): Promise<void> {
  try {
    await fetch(url, { method: "GET" });
  } catch {
    // ignore
  }
}

/** Warm common booking API routes so cold Netlify starts are less likely during checkout. */
export const handler = schedule("*/10 * * * *", async () => {
  const base = process.env.APP_BASE_URL ?? process.env.URL;
  if (!base) return { statusCode: 200 };
  const root = base.replace(/\/$/, "");
  await ping(`${root}/api/experiences`);
  try {
    await fetch(`${root}/api/booking/create-hold`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  } catch {
    // ignore
  }
  try {
    await fetch(`${root}/api/booking/create-payment-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  } catch {
    // ignore
  }
  return { statusCode: 200 };
});
