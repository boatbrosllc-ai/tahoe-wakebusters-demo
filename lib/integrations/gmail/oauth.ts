import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { GMAIL_ACCOUNT_EMAIL, GMAIL_READONLY_SCOPE, gmailOauthRedirectUri } from "./constants";

function oauthClientId(): string {
  const id = process.env.GMAIL_OAUTH_CLIENT_ID?.trim();
  if (!id) throw new Error("GMAIL_OAUTH_CLIENT_ID is not configured");
  return id;
}

function oauthClientSecret(): string {
  const secret = process.env.GMAIL_OAUTH_CLIENT_SECRET?.trim();
  if (!secret) throw new Error("GMAIL_OAUTH_CLIENT_SECRET is not configured");
  return secret;
}

function stateSecret(): string {
  return (
    process.env.GMAIL_OAUTH_STATE_SECRET?.trim() ||
    process.env.ADMIN_EDGE_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    ""
  );
}

export type GmailOauthState = {
  n: string;
  ts: number;
  admin?: string;
};

export function createGmailOauthState(adminEmail?: string): string {
  const secret = stateSecret();
  if (!secret) throw new Error("OAuth state secret is not configured");
  const payload: GmailOauthState = { n: randomBytes(16).toString("hex"), ts: Date.now(), admin: adminEmail };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyGmailOauthState(raw: string): GmailOauthState | null {
  const secret = stateSecret();
  if (!secret) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GmailOauthState;
    if (Date.now() - parsed.ts > 15 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildGmailAuthUrl(baseUrl: string, state: string): string {
  const params = new URLSearchParams({
    client_id: oauthClientId(),
    redirect_uri: gmailOauthRedirectUri(baseUrl),
    response_type: "code",
    scope: GMAIL_READONLY_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    login_hint: GMAIL_ACCOUNT_EMAIL,
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGmailAuthCode(
  baseUrl: string,
  code: string
): Promise<{ refresh_token?: string; access_token: string; expires_in: number; scope?: string; email?: string }> {
  const body = new URLSearchParams({
    code,
    client_id: oauthClientId(),
    client_secret: oauthClientSecret(),
    redirect_uri: gmailOauthRedirectUri(baseUrl),
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    refresh_token?: string;
    access_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Gmail OAuth token exchange failed");
  }
  const email = await fetchConnectedEmail(json.access_token);
  return {
    refresh_token: json.refresh_token,
    access_token: json.access_token,
    expires_in: json.expires_in ?? 3600,
    scope: json.scope,
    email,
  };
}

export async function refreshGmailAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number; scope?: string }> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: oauthClientId(),
    client_secret: oauthClientSecret(),
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Gmail access token refresh failed");
  }
  return { access_token: json.access_token, expires_in: json.expires_in ?? 3600, scope: json.scope };
}

export async function fetchConnectedEmail(accessToken: string): Promise<string | undefined> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return undefined;
  const json = (await res.json()) as { emailAddress?: string };
  return json.emailAddress?.trim().toLowerCase();
}
