import { NextRequest, NextResponse } from "next/server";
import { bookingEnv } from "@/lib/booking/env";
import { GMAIL_ACCOUNT_EMAIL, GMAIL_OAUTH_STATE_COOKIE, GMAIL_READONLY_SCOPE } from "@/lib/integrations/gmail/constants";
import { exchangeGmailAuthCode, verifyGmailOauthState } from "@/lib/integrations/gmail/oauth";
import { saveGmailOauthTokens } from "@/lib/integrations/gmail/token-store";
import { startOrRenewGmailWatch } from "@/lib/integrations/gmail/watch";
import { seedDefaultMarketplaceMappings } from "@/lib/integrations/marketplaces/mapping-store";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const err = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = request.cookies.get(GMAIL_OAUTH_STATE_COOKIE)?.value;
  const base = bookingEnv.appBaseUrl.replace(/\/$/, "");
  const fail = (message: string) => NextResponse.redirect(`${base}/admin/integrations?gmail=error&reason=${encodeURIComponent(message)}`);

  if (err) return fail(err);
  if (!code || !state || !cookieState || state !== cookieState) return fail("oauth_state_mismatch");
  if (!verifyGmailOauthState(state)) return fail("oauth_state_invalid");

  try {
    const tokens = await exchangeGmailAuthCode(bookingEnv.appBaseUrl, code);
    const email = (tokens.email ?? "").toLowerCase();
    if (email && email !== GMAIL_ACCOUNT_EMAIL) {
      return fail("connected_wrong_account");
    }
    if (tokens.scope && !tokens.scope.includes("gmail.readonly")) {
      return fail("missing_readonly_scope");
    }
    if (!tokens.refresh_token) {
      return fail("missing_refresh_token");
    }
    await saveGmailOauthTokens({
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresIn: tokens.expires_in,
      connectedEmail: email || GMAIL_ACCOUNT_EMAIL,
      scope: tokens.scope || GMAIL_READONLY_SCOPE,
    });
    await seedDefaultMarketplaceMappings();
    await startOrRenewGmailWatch();
    const res = NextResponse.redirect(`${base}/admin/integrations?gmail=connected`);
    res.cookies.set(GMAIL_OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "oauth_exchange_failed");
  }
}
