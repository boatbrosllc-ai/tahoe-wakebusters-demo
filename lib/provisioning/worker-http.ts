import { executeProvisioningJob } from "./jobs";
import type { ProvisioningJobRequest } from "./worker-client";
import type { ProvisioningEnv } from "./runtime";
import { getProvisioningWorkerSecret, verifyProvisioningWorkerRequest } from "./worker-hmac";

const JOBS_PATH = "/v1/jobs";

export type WorkerHttpResult = {
  status: number;
  body: Record<string, unknown>;
};

export async function handleProvisioningWorkerHttp(input: {
  method: string;
  path: string;
  body: string;
  headers: Headers | Record<string, string | null | undefined>;
  env?: ProvisioningEnv;
}): Promise<WorkerHttpResult> {
  const env = input.env ?? process.env;
  const urlPath = input.path.split("?")[0] || "/";

  if (input.method === "GET" && (urlPath === "/" || urlPath === "/healthz")) {
    return { status: 200, body: { ok: true, service: "slipstack-provisioner" } };
  }

  if (input.method !== "POST" || urlPath !== JOBS_PATH) {
    return { status: 404, body: { ok: false, detail: "Not found" } };
  }

  let secret: string;
  try {
    secret = getProvisioningWorkerSecret(env);
  } catch (err) {
    return { status: 500, body: { ok: false, detail: err instanceof Error ? err.message : "Worker secret missing" } };
  }

  const auth = verifyProvisioningWorkerRequest({
    method: input.method,
    path: urlPath,
    body: input.body,
    headers: input.headers,
    secret,
  });
  if (!auth.ok) {
    return { status: auth.status, body: { ok: false, detail: auth.error } };
  }

  let request: ProvisioningJobRequest;
  try {
    request = JSON.parse(input.body) as ProvisioningJobRequest;
  } catch {
    return { status: 400, body: { ok: false, detail: "Invalid JSON body" } };
  }
  if (request.job !== "health" && request.job !== "create_customer_project") {
    return { status: 400, body: { ok: false, detail: "Unknown job" } };
  }

  try {
    const execEnv: ProvisioningEnv = { ...env };
    if (execEnv.PROVISIONING_USE_MOCK?.trim() !== "1") {
      execEnv.PROVISIONING_RUNTIME = "cloudrun";
    }
    const result = await executeProvisioningJob(request, execEnv);
    return { status: result.ok ? 200 : 501, body: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Provisioning job failed";
    return { status: 500, body: { ok: false, detail: message.replace(/ya29\.[A-Za-z0-9._-]+/g, "[redacted-token]") } };
  }
}
