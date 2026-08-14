import {
  DEPRECATED_PROVISIONING_JSON_B64_ENV,
  DEPRECATED_PROVISIONING_JSON_ENV,
  SLIPSTACK_PROVISIONER_SA_EMAIL,
} from "./constants";
import {
  detectProvisioningRuntime,
  isProductionLikeRuntime,
  type ProvisioningEnv,
  type ProvisioningRuntime,
} from "./runtime";

export type ProvisioningAuthMode =
  | "worker"
  | "adc"
  | "impersonate"
  | "mock"
  | "deprecated_json";

export type ProvisioningAuthDecision = {
  runtime: ProvisioningRuntime;
  mode: ProvisioningAuthMode;
  /** Service account Google APIs should run as. */
  serviceAccountEmail: string;
  /** Present only when mode is impersonate. */
  impersonateServiceAccount?: string;
  /** Why JSON-key env vars must not be used in this runtime. */
  jsonKeyBlockedReason?: string;
};

function hasDeprecatedJsonKey(env: ProvisioningEnv): boolean {
  return Boolean(env[DEPRECATED_PROVISIONING_JSON_ENV]?.trim() || env[DEPRECATED_PROVISIONING_JSON_B64_ENV]?.trim());
}

function allowDeprecatedJson(env: ProvisioningEnv): boolean {
  return env.ALLOW_DEPRECATED_PROVISIONING_SA_JSON?.trim() === "1" && !isProductionLikeRuntime(env);
}

export function resolveProvisioningAuth(env: ProvisioningEnv = process.env): ProvisioningAuthDecision {
  const runtime = detectProvisioningRuntime(env);
  const serviceAccountEmail =
    env.GOOGLE_PROVISIONING_SERVICE_ACCOUNT_EMAIL?.trim() || SLIPSTACK_PROVISIONER_SA_EMAIL;
  const impersonate = env.GOOGLE_PROVISIONING_IMPERSONATE_SA?.trim();

  if (env.PROVISIONING_USE_MOCK?.trim() === "1") {
    if (runtime === "netlify" || runtime === "cloudrun") {
      throw new Error("PROVISIONING_USE_MOCK is not allowed on Netlify or Cloud Run.");
    }
    return { runtime, mode: "mock", serviceAccountEmail };
  }

  if (hasDeprecatedJsonKey(env)) {
    if (!allowDeprecatedJson(env)) {
      return {
        runtime,
        mode: runtime === "netlify" ? "worker" : impersonate ? "impersonate" : "adc",
        serviceAccountEmail,
        impersonateServiceAccount: impersonate || undefined,
        jsonKeyBlockedReason:
          `${DEPRECATED_PROVISIONING_JSON_ENV} / ${DEPRECATED_PROVISIONING_JSON_B64_ENV} are non-production only. ` +
          "Production must stay keyless (Cloud Run ADC). Do not disable iam.managed.disableServiceAccountKeyCreation.",
      };
    }
    return { runtime, mode: "deprecated_json", serviceAccountEmail };
  }

  if (runtime === "netlify") {
    return { runtime, mode: "worker", serviceAccountEmail };
  }

  if (impersonate) {
    return {
      runtime,
      mode: "impersonate",
      serviceAccountEmail: impersonate,
      impersonateServiceAccount: impersonate,
    };
  }

  return { runtime, mode: "adc", serviceAccountEmail };
}
