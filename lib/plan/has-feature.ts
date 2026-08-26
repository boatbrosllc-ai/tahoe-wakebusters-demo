import { siteConfig } from "@/config/site";
import {
  normalizePlan,
  PLAN_FEATURE_DEFAULTS,
  resolveFeatureFlags,
} from "@/lib/plan/entitlements";
import type { FeatureFlags, FeatureKey, PlanId } from "@/lib/plan/types";

type PlanConfigSlice = {
  plan?: PlanId | string;
  features?: Partial<FeatureFlags>;
};

export function getCustomerPlan(config: PlanConfigSlice = siteConfig): PlanId {
  return normalizePlan(config.plan);
}

/**
 * Effective flags for this deployment: plan defaults, with `siteConfig.features`
 * treated as the resolved snapshot / overrides written by the launch importer.
 */
export function getFeatureFlags(config: PlanConfigSlice = siteConfig): FeatureFlags {
  const plan = normalizePlan(config.plan);
  return resolveFeatureFlags(plan, config.features ?? null);
}

/**
 * Prefer this helper over `if (plan === "lite")` checks.
 * Missing keys fall back to the plan default (safe for legacy site.ts files).
 */
export function hasFeature(feature: FeatureKey, config: PlanConfigSlice = siteConfig): boolean {
  const plan = normalizePlan(config.plan);
  const fromConfig = config.features?.[feature];
  if (typeof fromConfig === "boolean") return fromConfig;
  return PLAN_FEATURE_DEFAULTS[plan][feature];
}
