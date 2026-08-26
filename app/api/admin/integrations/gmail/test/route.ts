import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth-firebase";
import { gmailGetProfile } from "@/lib/integrations/gmail/client";
import { getGmailAccessToken } from "@/lib/integrations/gmail/token-store";
import { GMAIL_ACCOUNT_EMAIL, GMAIL_READONLY_SCOPE } from "@/lib/integrations/gmail/constants";
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
    const access = await getGmailAccessToken();
    const profile = await gmailGetProfile(access);
    const emailOk = (profile.emailAddress ?? "").toLowerCase() === GMAIL_ACCOUNT_EMAIL;
    return NextResponse.json({
      ok: emailOk,
      emailAddress: profile.emailAddress,
      historyId: profile.historyId,
      scope: GMAIL_READONLY_SCOPE,
      expectedEmail: GMAIL_ACCOUNT_EMAIL,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
