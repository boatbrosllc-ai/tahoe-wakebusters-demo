import { schedule } from "@netlify/functions";

export const handler = schedule("*/10 * * * *", async () => {
  const base = process.env.APP_BASE_URL ?? process.env.URL;
  if (!base) return { statusCode: 200 };
  const url = `${base.replace(/\/$/, "")}/api/experiences`;
  try {
    await fetch(url);
  } catch {
    // ignore
  }
  return { statusCode: 200 };
});
