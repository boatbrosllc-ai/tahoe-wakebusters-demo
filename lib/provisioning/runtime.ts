/**
 * Where this process is running. Used only to choose an auth strategy.
 * Netlify Functions do not expose a Google-verifiable OIDC JWT.
 */

export type ProvisioningRuntime = "netlify" | "cloudrun" | "local";

export type ProvisioningEnv = Record<string, string | undefined>;

function truthy(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function isNetlifyRuntime(env: ProvisioningEnv = process.env): boolean {
  return truthy(env.NETLIFY) || Boolean(env.NETLIFY_DEV?.trim());
}

/** Cloud Run sets K_SERVICE on every revision. */
export function isCloudRunRuntime(env: ProvisioningEnv = process.env): boolean {
  return Boolean(env.K_SERVICE?.trim()) || env.PROVISIONING_RUNTIME?.trim() === "cloudrun";
}

export function detectProvisioningRuntime(env: ProvisioningEnv = process.env): ProvisioningRuntime {
  const forced = env.PROVISIONING_RUNTIME?.trim().toLowerCase();
  if (forced === "netlify" || forced === "cloudrun" || forced === "local") {
    return forced;
  }
  if (isCloudRunRuntime(env)) return "cloudrun";
  if (isNetlifyRuntime(env)) return "netlify";
  return "local";
}

export function isProductionLikeRuntime(env: ProvisioningEnv = process.env): boolean {
  return env.NODE_ENV === "production" || isNetlifyRuntime(env) || isCloudRunRuntime(env);
}
