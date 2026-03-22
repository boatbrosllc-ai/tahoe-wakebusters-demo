/**
 * Cron: process pending booking confirmation outbox jobs.
 * Run every 1–2 minutes. Processes up to MAX_PER_RUN jobs per run to avoid multi-minute
 * delivery delays when multiple bookings arrive simultaneously. Sends confirmation email (+ SMS),
 * then marks sent or retries with exponential backoff. Dead-letter jobs surface in admin.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/booking/firebase-admin";
import { processNextPendingConfirmation } from "@/lib/booking/notification-outbox";
import { timingSafeStringEqual } from "@/lib/booking/secure-compare";
import { writeOperationalAlert } from "@/lib/booking/operational-alerts";

const MAX_PER_RUN = 10;

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") ?? "";
  if (!cronSecret || !timingSafeStringEqual(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  let sentCount = 0;
  let failedCount = 0;
  let noneCount = 0;

  for (let i = 0; i < MAX_PER_RUN; i++) {
    const result = await processNextPendingConfirmation(db);
    if (result === "sent") sentCount++;
    else if (result === "failed" || result === "dead_letter") failedCount++;
    else {
      noneCount++;
      break;
    }
  }

  if (failedCount > 0) {
    await writeOperationalAlert({
      type: "confirmation_outbox_cron_failures",
      failedCount,
      source: "process-confirmation-outbox",
    });
  }

  return NextResponse.json({
    ok: true,
    sentCount,
    failedCount,
    noneCount,
  });
}
