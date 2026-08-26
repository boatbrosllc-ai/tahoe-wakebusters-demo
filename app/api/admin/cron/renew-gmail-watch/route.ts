import { NextRequest, NextResponse } from "next/server";
import { assertCronPostAuthorized } from "@/lib/booking/cron-auth";
import { renewGmailWatchIfNeeded } from "@/lib/integrations/gmail/watch";
import { skipCronIfFeatureDisabled } from "@/lib/plan";

export async function POST(request: NextRequest) {
  // PLAN_FEATURE_GATE
  {
    const skipped = skipCronIfFeatureDisabled("marketplaceSync");
    if (skipped) return skipped;
  }

  const authErr = await assertCronPostAuthorized(request);
  if (authErr) return authErr;
  try {
    const result = await renewGmailWatchIfNeeded();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
