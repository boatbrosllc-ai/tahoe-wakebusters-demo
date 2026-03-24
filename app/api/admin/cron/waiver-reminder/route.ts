import { NextRequest, NextResponse } from "next/server";
import { runWaiverReminderCron } from "@/lib/waiver/reminder-cron-logic";
import { assertCronPostAuthorized } from "@/lib/booking/cron-auth";

export async function POST(request: NextRequest) {
  const authErr = await assertCronPostAuthorized(request);
  if (authErr) return authErr;

  const { matched, sent, reconcileScanned, reconcileCreated } = await runWaiverReminderCron("admin/cron/waiver-reminder");
  return NextResponse.json({ matched, sent, reconcileScanned, reconcileCreated });
}
