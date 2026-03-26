import { schedule } from "@netlify/functions";

async function getUrl(url: string): Promise<void> {
  try {
    await fetch(url, { method: "GET" });
  } catch {
    // ignore
  }
}

async function postJson(url: string, body: unknown): Promise<void> {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // ignore
  }
}

function formatYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Minimal body that passes `parseCreateHoldBody` and reaches Firestore (`getDb()`) before slot/experience validation fails. */
const WARM_CREATE_HOLD_BODY = {
  experienceId: "_warm_",
  slotId: "_warm_slot_",
  rateId: "_warm_rate_",
  partySize: 2,
  bookingMode: "charter" as const,
  customerDraft: {
    name: "Warm Cron",
    email: "warm@example.com",
    phone: "5125550100",
  },
};

/** Warm common booking API routes so cold Netlify starts are less likely during checkout. */
export const handler = schedule("*/5 * * * *", async () => {
  const base = process.env.APP_BASE_URL ?? process.env.URL;
  if (!base) return { statusCode: 200 };
  const root = base.replace(/\/$/, "");

  await getUrl(`${root}/api/experiences`);

  const warmId = (process.env.WARM_EXPERIENCE_ID ?? "").trim();
  if (warmId) {
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 3);
    const startDate = formatYmd(start);
    const endDate = formatYmd(end);
    const slotsUrl = `${root}/api/booking/slots?experienceId=${encodeURIComponent(warmId)}&startDate=${startDate}&endDate=${endDate}`;
    await getUrl(slotsUrl);
    const detailUrl = `${root}/api/booking/experience-detail?experienceId=${encodeURIComponent(warmId)}`;
    await getUrl(detailUrl);
    const monthStart = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
    const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    const datePricesUrl = `${root}/api/booking/date-prices?experienceId=${encodeURIComponent(warmId)}&startDate=${monthStart}&days=${daysInMonth}`;
    await getUrl(datePricesUrl);
  }

  await postJson(`${root}/api/booking/create-hold`, WARM_CREATE_HOLD_BODY);
  await postJson(`${root}/api/booking/create-payment-intent`, { holdId: "_warm_" });
  await postJson(`${root}/api/stripe/webhook`, { type: "warm_ping" });

  const warmDatePricesPing = `${root}/api/booking/date-prices?experienceId=_warm_&startDate=2099-01-01&days=1`;
  await getUrl(warmDatePricesPing);
  const warmSlotsPing = `${root}/api/booking/slots?experienceId=_warm_&startDate=2099-01-01&endDate=2099-01-01`;
  await getUrl(warmSlotsPing);

  return { statusCode: 200 };
});
