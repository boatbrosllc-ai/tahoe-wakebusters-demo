import { NextRequest, NextResponse } from "next/server";
import { runWaiverReminderCron } from "@/lib/waiver/reminder-cron-logic";
import { assertCronPostAuthorized } from "@/lib/booking/cron-auth";
import { skipCronIfFeatureDisabled } from "@/lib/plan";

export async function POST(request: NextRequest) {
  const authErr = await assertCronPostAuthorized(request);
  if (authErr) return authErr;

  const skipped = skipCronIfFeatureDisabled("waivers");
  if (skipped) return skipped;

  const { matched, sent, reconcileScanned, reconcileCreated } = await runWaiverReminderCron("admin/cron/waiver-reminder");
  return NextResponse.json({ matched, sent, reconcileScanned, reconcileCreated });
}
