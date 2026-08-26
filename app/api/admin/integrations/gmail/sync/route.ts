import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { syncRecentMarketplaceEmails } from "@/lib/integrations/gmail/process-notification";
import { requireFeatureResponse } from "@/lib/plan";

export async function POST(request: NextRequest) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("marketplaceSync");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  try {
    const body = (await request.json().catch(() => ({}))) as { days?: number };
    const days = body.days === 30 ? 30 : 7;
    const result = await syncRecentMarketplaceEmails(days, { force: true });
    return NextResponse.json({ ok: true, days, ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
