import { resolveProvisioningAuth } from "./auth-mode";
import { getProvisioningWorkerSecret, signProvisioningWorkerRequest } from "./worker-hmac";
import type { ProvisioningEnv } from "./runtime";

export type ProvisioningJobName = "health" | "create_customer_project";

export type ProvisioningJobRequest = {
  job: ProvisioningJobName;
  payload?: Record<string, unknown>;
};

export type ProvisioningJobResult = {
  ok: boolean;
  job: ProvisioningJobName;
  runtime: string;
  authMode: string;
  serviceAccountEmail?: string;
  detail?: string;
};

function workerUrl(env: ProvisioningEnv): string {
  const url = env.PROVISIONING_WORKER_URL?.trim();
  if (!url) {
    throw new Error("PROVISIONING_WORKER_URL is required on Netlify (Cloud Run service URL).");
  }
  return url.replace(/\/$/, "");
}

/**
 * Netlify / local control-plane entry: signed HTTPS call to the Cloud Run worker.
 * Does not load Google credentials in this process.
 */
export async function invokeProvisioningWorker(
  request: ProvisioningJobRequest,
  env: ProvisioningEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<ProvisioningJobResult> {
  const decision = resolveProvisioningAuth(env);
  if (decision.jsonKeyBlockedReason) {
    throw new Error(decision.jsonKeyBlockedReason);
  }

  const path = "/v1/jobs";
  const body = JSON.stringify(request);
  const headers = signProvisioningWorkerRequest({
    method: "POST",
    path,
    body,
    secret: getProvisioningWorkerSecret(env),
  });

  const res = await fetchImpl(`${workerUrl(env)}${path}`, {
    method: "POST",
    headers,
    body,
  });

  const text = await res.text();
  let parsed: ProvisioningJobResult | null = null;
  try {
    parsed = JSON.parse(text) as ProvisioningJobResult;
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    throw new Error(parsed?.detail || `Provisioning worker HTTP ${res.status}`);
  }
  if (!parsed) {
    throw new Error("Provisioning worker returned a non-JSON response");
  }
  return parsed;
}
