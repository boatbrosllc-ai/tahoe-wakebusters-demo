import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, getAdminEmailFromSessionCookie } from "@/lib/admin-auth-firebase";
import { bookingEnv } from "@/lib/booking/env";
import { buildGmailAuthUrl, createGmailOauthState } from "@/lib/integrations/gmail/oauth";
import { GMAIL_OAUTH_STATE_COOKIE } from "@/lib/integrations/gmail/constants";
import { requireFeatureResponse } from "@/lib/plan";

export async function GET(request: NextRequest) {
  // PLAN_FEATURE_GATE
  {
    const planDenied = requireFeatureResponse("marketplaceSync");
    if (planDenied) return planDenied;
  }

  const unauthorized = await requireAdminSession(request.headers.get("cookie"));
  if (unauthorized) return unauthorized;
  try {
    const adminEmail = await getAdminEmailFromSessionCookie(request.headers.get("cookie"));
    const state = createGmailOauthState(adminEmail ?? undefined);
    const url = buildGmailAuthUrl(bookingEnv.appBaseUrl, state);
    const res = NextResponse.redirect(url);
    res.cookies.set(GMAIL_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60,
    });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
