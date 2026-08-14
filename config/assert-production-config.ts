/**
 * Fail closed in a real production deploy when identity or public URL is still
 * the generic template (or required URL env vars are missing).
 *
 * Local `next build` against localhost is allowed so the master template can
 * still compile. Netlify / a non-localhost production URL is not.
 */

import type { SiteConfig } from "@/config/site-types";
import { TEMPLATE_PLACEHOLDER } from "@/config/site-types";

type EnvLike = Record<string, string | undefined>;

function envUrl(env: EnvLike): string {
  return (env.NEXT_PUBLIC_SITE_URL?.trim() || env.APP_BASE_URL?.trim() || "").replace(/\/+$/, "");
}

function isLocalhostUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

export function isDeployedProduction(env: EnvLike = process.env): boolean {
  if (env.NETLIFY === "true" || env.CONTEXT === "production") return true;
  if (env.SLIPSTACK_CUSTOMER_CONFIG_REQUIRED === "1") return true;
  if (env.NODE_ENV !== "production") return false;
  const url = envUrl(env);
  return Boolean(url) && !isLocalhostUrl(url);
}

export function isTemplatePlaceholderConfig(config: SiteConfig): boolean {
  const name = config.company.name.trim();
  const domain = config.company.domain.trim().toLowerCase();
  const email = config.contact.email.trim().toLowerCase();
  return (
    name === TEMPLATE_PLACEHOLDER.companyName ||
    domain === TEMPLATE_PLACEHOLDER.domain ||
    email === TEMPLATE_PLACEHOLDER.email
  );
}

export function requireProductionSiteUrl(env: EnvLike = process.env): string {
  const fromEnv = envUrl(env);
  if (fromEnv) {
    if (isDeployedProduction(env) && /example\.com$/i.test(fromEnv.replace(/^https?:\/\//, ""))) {
      throw new Error(
        "[slipstack] NEXT_PUBLIC_SITE_URL / APP_BASE_URL still points at example.com. Set the customer's real public URL."
      );
    }
    return fromEnv;
  }
  if (isDeployedProduction(env)) {
    throw new Error(
      "[slipstack] NEXT_PUBLIC_SITE_URL or APP_BASE_URL is required in production. Refusing to fall back to a generic domain."
    );
  }
  return "";
}

export function assertCustomerConfigForDeploy(config: SiteConfig, env: EnvLike = process.env): void {
  if (!isDeployedProduction(env)) return;
  if (isTemplatePlaceholderConfig(config)) {
    throw new Error(
      "[slipstack] This clone still has template placeholder company/domain/email in config/site.ts. Fill customer identity before deploying to production."
    );
  }
}
