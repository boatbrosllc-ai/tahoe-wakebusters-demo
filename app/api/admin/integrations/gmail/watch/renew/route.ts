import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { startOrRenewGmailWatch } from "@/lib/integrations/gmail/watch";
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
    const state = await startOrRenewGmailWatch();
    return NextResponse.json({
      ok: true,
      expirationMs: state.expirationMs,
      historyId: state.historyId,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
