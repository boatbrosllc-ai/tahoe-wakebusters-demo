import { NextRequest, NextResponse } from "next/server";
import { runWaiverReminderCron } from "@/lib/waiver/reminder-cron-logic";
import { timingSafeStringEqual } from "@/lib/booking/secure-compare";

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization") ?? "";
  if (!cronSecret || !timingSafeStringEqual(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matched, sent } = await runWaiverReminderCron("admin/cron/waiver-reminder");
  return NextResponse.json({ matched, sent });
}
