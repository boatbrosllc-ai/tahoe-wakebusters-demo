import { createHash, timingSafeEqual } from "crypto";
import { GMAIL_ACCOUNT_EMAIL, GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT } from "./constants";

export type PubSubPushBody = {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
    attributes?: Record<string, string>;
  };
  subscription?: string;
};

export type GmailPushNotification = {
  emailAddress?: string;
  historyId?: string;
};

export function decodePubSubMessageData(data?: string): GmailPushNotification | null {
  if (!data) return null;
  try {
    const json = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const parsed = JSON.parse(json) as GmailPushNotification;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function pubSubTokenMatches(provided: string | null, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isExpectedGmailPush(notification: GmailPushNotification | null): boolean {
  if (!notification?.historyId) return false;
  if (notification.emailAddress && notification.emailAddress.toLowerCase() !== GMAIL_ACCOUNT_EMAIL) {
    return false;
  }
  return true;
}

export function pubSubDeliveryId(body: PubSubPushBody): string {
  const messageId = body.message?.messageId?.trim();
  if (messageId) return messageId;
  const data = body.message?.data ?? "";
  return createHash("sha256").update(data).digest("hex");
}

export async function verifyGoogleOidcToken(
  authorizationHeader: string | null,
  audience: string
): Promise<boolean> {
  if (!authorizationHeader?.toLowerCase().startsWith("bearer ")) return false;
  const token = authorizationHeader.slice(7).trim();
  if (!token) return false;
  try {
    const url = new URL("https://oauth2.googleapis.com/tokeninfo");
    url.searchParams.set("id_token", token);
    const res = await fetch(url);
    if (!res.ok) return false;
    const json = (await res.json()) as { aud?: string; iss?: string; email?: string; email_verified?: string };
    const audOk = json.aud === audience || json.aud === `${audience}/`;
    const issOk = json.iss === "https://accounts.google.com" || json.iss === "accounts.google.com";
    const emailOk =
      !json.email || json.email === GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT;
    return audOk && issOk && emailOk;
  } catch {
    return false;
  }
}
