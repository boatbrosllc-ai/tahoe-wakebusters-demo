import { SITE_IDS, type SiteConfig, type SiteId } from "@/config/site-types";
import { abcBoatsConfig } from "@/sites/abc-boats/config";
import { platformDevConfig } from "@/sites/platform-dev/config";

/**
 * Customer site registry.
 *
 * Add a new customer by:
 * 1. Creating `sites/<id>/` (config + frontend)
 * 2. Registering it here
 * 3. Adding `<id>` to `SITE_IDS` in `config/site-types.ts`
 *
 * Selection is development-only for now: `SLIPSTACK_SITE_ID` (or
 * `NEXT_PUBLIC_SLIPSTACK_SITE_ID`). Domain-based routing is not implemented.
 */
export const SITE_REGISTRY: Record<SiteId, SiteConfig> = {
  "platform-dev": platformDevConfig,
  "abc-boats": abcBoatsConfig,
};

type EnvLike = Record<string, string | undefined>;

function readSiteIdFromEnv(env: EnvLike): string {
  return (
    env.NEXT_PUBLIC_SLIPSTACK_SITE_ID?.trim() ||
    env.SLIPSTACK_SITE_ID?.trim() ||
    env.SITE_ID?.trim() ||
    ""
  );
}

export function isSiteId(value: string): value is SiteId {
  return (SITE_IDS as readonly string[]).includes(value);
}

function isProductionEnv(env: EnvLike): boolean {
  return env.NODE_ENV === "production" || Boolean(env.NETLIFY);
}

/** Active customer site. Unknown values fail in production; local dev falls back to platform-dev. */
export function getActiveSiteId(env: EnvLike = process.env): SiteId {
  const raw = readSiteIdFromEnv(env);
  if (isSiteId(raw)) return raw;
  if (isProductionEnv(env)) {
    throw new Error(
      `[slipstack] Unknown or missing SLIPSTACK_SITE_ID "${raw}". Known: ${SITE_IDS.join(", ")}. Refusing to serve platform-dev.`
    );
  }
  if (raw && typeof console !== "undefined") {
    console.warn(
      `[slipstack] Unknown SLIPSTACK_SITE_ID "${raw}". Falling back to platform-dev. Known: ${SITE_IDS.join(", ")}.`
    );
  }
  return "platform-dev";
}

export function getSiteConfig(siteId: SiteId = getActiveSiteId()): SiteConfig {
  return SITE_REGISTRY[siteId];
}
