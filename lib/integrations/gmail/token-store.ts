import { getDb, getFirestoreExports } from "@/lib/booking/firebase-admin";
import { decryptSecret, encryptSecret } from "./crypto";
import { refreshGmailAccessToken } from "./oauth";
import {
  GMAIL_ACCOUNT_EMAIL,
  GMAIL_INTEGRATION_COLLECTION,
  GMAIL_OAUTH_DOC,
  GMAIL_READONLY_SCOPE,
} from "./constants";

export type StoredGmailOauth = {
  connectedEmail: string;
  scope: string;
  connectedAtMs: number;
  accessTokenExpiresAtMs?: number;
};

type OauthDoc = {
  refreshCiphertext?: string;
  refreshIv?: string;
  refreshTag?: string;
  accessCiphertext?: string;
  accessIv?: string;
  accessTag?: string;
  connectedEmail?: string;
  scope?: string;
  connectedAtMs?: number;
  accessTokenExpiresAtMs?: number;
};

type CachedAccessToken = { token: string; expiresAtMs: number };

let envAccessTokenCache: CachedAccessToken | null = null;

function oauthRef() {
  return getDb().collection(GMAIL_INTEGRATION_COLLECTION).doc(GMAIL_OAUTH_DOC);
}

export async function saveGmailOauthTokens(input: {
  refreshToken?: string;
  accessToken: string;
  expiresIn: number;
  connectedEmail: string;
  scope?: string;
}): Promise<void> {
  const { Timestamp } = getFirestoreExports();
  const refresh = input.refreshToken ? encryptSecret(input.refreshToken) : null;
  const access = encryptSecret(input.accessToken);
  const patch: Record<string, unknown> = {
    accessCiphertext: access.ciphertext,
    accessIv: access.iv,
    accessTag: access.tag,
    connectedEmail: input.connectedEmail,
    scope: input.scope || GMAIL_READONLY_SCOPE,
    accessTokenExpiresAtMs: Date.now() + input.expiresIn * 1000,
    updatedAt: Timestamp.now(),
  };
  if (refresh) {
    patch.refreshCiphertext = refresh.ciphertext;
    patch.refreshIv = refresh.iv;
    patch.refreshTag = refresh.tag;
    patch.connectedAtMs = Date.now();
  }
  await oauthRef().set(patch, { merge: true });
}

function envRefreshToken(): string | undefined {
  const v = process.env.GMAIL_REFRESH_TOKEN?.trim();
  return v || undefined;
}

function logGmailTokenError(marker: "decrypt-failed" | "refresh-failed" | "store-failed", err: unknown): void {
  console.error(`[gmail-token:${marker}]`, err);
}

export async function loadGmailOauthStatus(): Promise<StoredGmailOauth | null> {
  try {
    const snap = await oauthRef().get();
    if (snap.exists) {
      const data = snap.data() as OauthDoc;
      if (data.refreshCiphertext && data.connectedEmail) {
        return {
          connectedEmail: data.connectedEmail,
          scope: data.scope || GMAIL_READONLY_SCOPE,
          connectedAtMs: data.connectedAtMs ?? 0,
          accessTokenExpiresAtMs: data.accessTokenExpiresAtMs,
        };
      }
    }
  } catch (err) {
    logGmailTokenError("store-failed", err);
  }
  if (envRefreshToken()) {
    return {
      connectedEmail: GMAIL_ACCOUNT_EMAIL,
      scope: GMAIL_READONLY_SCOPE,
      connectedAtMs: 0,
    };
  }
  return null;
}

async function accessTokenFromEnvRefresh(): Promise<string> {
  const envToken = envRefreshToken();
  if (!envToken) throw new Error("Gmail is not connected");
  const now = Date.now();
  if (envAccessTokenCache && envAccessTokenCache.expiresAtMs > now + 60_000) {
    return envAccessTokenCache.token;
  }
  try {
    const refreshed = await refreshGmailAccessToken(envToken);
    envAccessTokenCache = {
      token: refreshed.access_token,
      expiresAtMs: now + refreshed.expires_in * 1000,
    };
    return refreshed.access_token;
  } catch (err) {
    logGmailTokenError("refresh-failed", err);
    throw err;
  }
}

export async function getGmailAccessToken(): Promise<string> {
  const now = Date.now();
  try {
    const snap = await oauthRef().get();
    if (snap.exists) {
      const data = snap.data() as OauthDoc;
      if (
        data.accessCiphertext &&
        data.accessIv &&
        data.accessTag &&
        (data.accessTokenExpiresAtMs ?? 0) > now + 60_000
      ) {
        try {
          return decryptSecret({ ciphertext: data.accessCiphertext, iv: data.accessIv, tag: data.accessTag });
        } catch (err) {
          logGmailTokenError("decrypt-failed", err);
        }
      }
      if (data.refreshCiphertext && data.refreshIv && data.refreshTag) {
        let refreshToken: string;
        try {
          refreshToken = decryptSecret({
            ciphertext: data.refreshCiphertext,
            iv: data.refreshIv,
            tag: data.refreshTag,
          });
        } catch (err) {
          logGmailTokenError("decrypt-failed", err);
          return accessTokenFromEnvRefresh();
        }
        try {
          const refreshed = await refreshGmailAccessToken(refreshToken);
          await saveGmailOauthTokens({
            accessToken: refreshed.access_token,
            expiresIn: refreshed.expires_in,
            connectedEmail: data.connectedEmail || GMAIL_ACCOUNT_EMAIL,
            scope: refreshed.scope || data.scope,
          });
          return refreshed.access_token;
        } catch (err) {
          logGmailTokenError("refresh-failed", err);
        }
      }
    }
  } catch (err) {
    logGmailTokenError("store-failed", err);
  }
  return accessTokenFromEnvRefresh();
}
