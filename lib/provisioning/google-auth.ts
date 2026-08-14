/**
 * Keyless Google credentials for the org provisioner.
 * Business logic should call getProvisioningAuthClient() and never parse SA JSON.
 */
import { resolveProvisioningAuth, type ProvisioningAuthDecision } from "./auth-mode";
import { DEPRECATED_PROVISIONING_JSON_B64_ENV, DEPRECATED_PROVISIONING_JSON_ENV } from "./constants";
import type { ProvisioningEnv } from "./runtime";

export type ProvisioningAuthClient = {
  mode: ProvisioningAuthDecision["mode"];
  serviceAccountEmail: string;
  getAccessToken: () => Promise<string>;
};

const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";

function redactAuthErrors(err: unknown): Error {
  const message = err instanceof Error ? err.message : "Google auth failed";
  return new Error(message.replace(/ya29\.[A-Za-z0-9._-]+/g, "[redacted-token]"));
}

async function accessTokenFromMetadata(): Promise<string> {
  const res = await fetch(METADATA_TOKEN_URL, {
    headers: { "Metadata-Flavor": "Google" },
  });
  if (!res.ok) {
    throw new Error(`Cloud Run metadata token request failed (${res.status})`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("Cloud Run metadata response did not include an access token");
  }
  return json.access_token;
}

async function impersonateAccessToken(subjectToken: string, serviceAccountEmail: string): Promise<string> {
  const url =
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/` +
    `${encodeURIComponent(serviceAccountEmail)}:generateAccessToken`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${subjectToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      scope: ["https://www.googleapis.com/auth/cloud-platform"],
    }),
  });
  if (!res.ok) {
    throw new Error(`Service account impersonation failed (${res.status})`);
  }
  const json = (await res.json()) as { accessToken?: string };
  if (!json.accessToken) {
    throw new Error("Impersonation response did not include an access token");
  }
  return json.accessToken;
}

async function accessTokenFromAdcLibrary(): Promise<string> {
  type AdcAuth = {
    getClient: () => Promise<{ getAccessToken: () => Promise<{ token?: string | null }> }>;
  };
  type AdcCtor = new (opts: { scopes: string[] }) => AdcAuth;
  let GoogleAuth: AdcCtor;
  try {
    const mod = (await import("google-auth-library")) as { GoogleAuth: AdcCtor };
    GoogleAuth = mod.GoogleAuth;
  } catch {
    throw new Error(
      "Local Application Default Credentials require google-auth-library, or set PROVISIONING_USE_MOCK=1 for tests. " +
        "Run: gcloud auth application-default login"
    );
  }
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) {
    throw new Error("Application Default Credentials did not return an access token");
  }
  return token.token;
}

function parseDeprecatedJson(env: ProvisioningEnv): Record<string, unknown> {
  const raw = env[DEPRECATED_PROVISIONING_JSON_ENV]?.trim();
  const b64 = env[DEPRECATED_PROVISIONING_JSON_B64_ENV]?.trim();
  const text = raw || (b64 ? Buffer.from(b64, "base64").toString("utf8") : "");
  const parsed = JSON.parse(text) as Record<string, unknown>;
  if (typeof parsed.private_key === "string") {
    parsed.private_key = "[redacted]";
  }
  throw new Error(
    "deprecated_json mode is test-only and does not mint tokens. Use ADC, impersonation, or PROVISIONING_USE_MOCK=1."
  );
}

export async function getProvisioningAuthClient(
  env: ProvisioningEnv = process.env
): Promise<ProvisioningAuthClient> {
  const decision = resolveProvisioningAuth(env);

  if (decision.jsonKeyBlockedReason) {
    throw new Error(decision.jsonKeyBlockedReason);
  }

  if (decision.mode === "worker") {
    throw new Error(
      "Netlify cannot hold Google credentials. Call the Cloud Run provisioner via invokeProvisioningWorker()."
    );
  }

  if (decision.mode === "mock") {
    return {
      mode: "mock",
      serviceAccountEmail: decision.serviceAccountEmail,
      getAccessToken: async () => "mock-provisioning-access-token",
    };
  }

  if (decision.mode === "deprecated_json") {
    parseDeprecatedJson(env);
  }

  return {
    mode: decision.mode,
    serviceAccountEmail: decision.serviceAccountEmail,
    getAccessToken: async () => {
      try {
        if (decision.mode === "impersonate" && decision.impersonateServiceAccount) {
          const subject =
            decision.runtime === "cloudrun" ? await accessTokenFromMetadata() : await accessTokenFromAdcLibrary();
          return await impersonateAccessToken(subject, decision.impersonateServiceAccount);
        }
        if (decision.runtime === "cloudrun") {
          return await accessTokenFromMetadata();
        }
        return await accessTokenFromAdcLibrary();
      } catch (err) {
        throw redactAuthErrors(err);
      }
    },
  };
}
