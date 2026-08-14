import { getProvisioningAuthClient } from "./google-auth";
import { resolveProvisioningAuth } from "./auth-mode";
import { invokeProvisioningWorker, type ProvisioningJobRequest, type ProvisioningJobResult } from "./worker-client";

export type { ProvisioningJobRequest, ProvisioningJobResult };
import type { ProvisioningEnv } from "./runtime";

/**
 * Control-plane entry. Netlify forwards to Cloud Run; Cloud Run / local execute with ADC.
 * Customer Firebase create logic is not implemented in this repository yet — health is the
 * only executed job. create_customer_project is accepted so future code can share this path.
 */
export async function runProvisioningJob(
  request: ProvisioningJobRequest,
  env: ProvisioningEnv = process.env
): Promise<ProvisioningJobResult> {
  const decision = resolveProvisioningAuth(env);
  if (decision.mode === "worker") {
    return invokeProvisioningWorker(request, env);
  }
  return executeProvisioningJob(request, env);
}

export async function executeProvisioningJob(
  request: ProvisioningJobRequest,
  env: ProvisioningEnv = process.env
): Promise<ProvisioningJobResult> {
  const auth = await getProvisioningAuthClient(env);

  if (request.job === "health") {
    const token = await auth.getAccessToken();
    if (!token) {
      throw new Error("Provisioning auth client returned an empty token");
    }
    return {
      ok: true,
      job: "health",
      runtime: resolveProvisioningAuth(env).runtime,
      authMode: auth.mode,
      serviceAccountEmail: auth.serviceAccountEmail,
      detail: "Authenticated; token not logged",
    };
  }

  if (request.job === "create_customer_project") {
    return {
      ok: false,
      job: request.job,
      runtime: resolveProvisioningAuth(env).runtime,
      authMode: auth.mode,
      serviceAccountEmail: auth.serviceAccountEmail,
      detail:
        "Customer Firebase project creation is not implemented in this repository yet. Auth is ready; do not add a JSON key.",
    };
  }

  return {
    ok: false,
    job: request.job,
    runtime: resolveProvisioningAuth(env).runtime,
    authMode: auth.mode,
    detail: "Unknown provisioning job",
  };
}
