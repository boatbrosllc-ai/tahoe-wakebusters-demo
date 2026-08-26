export {
  DEFAULT_PLAN,
  FEATURE_KEYS,
  PLAN_IDS,
  type FeatureFlags,
  type FeatureKey,
  type FeatureOverrides,
  type PlanId,
} from "@/lib/plan/types";

export {
  FEATURE_LABELS,
  PLAN_FEATURE_DEFAULTS,
  isPlanId,
  mergeFeatureOverrideSources,
  normalizePlan,
  resolveFeatureFlags,
} from "@/lib/plan/entitlements";

export { getCustomerPlan, getFeatureFlags, hasFeature } from "@/lib/plan/has-feature";

export {
  planFeatureDeniedBody,
  requireFeatureResponse,
  skipCronIfFeatureDisabled,
  type PlanFeatureDeniedBody,
} from "@/lib/plan/require-feature";

/** Admin nav / route → required feature (undefined = always available). */
export const ADMIN_NAV_FEATURE: Record<string, import("@/lib/plan/types").FeatureKey | undefined> = {
  "/admin": undefined,
  "/admin/experiences": undefined,
  "/admin/boats": undefined,
  "/admin/blog": "blogStudio",
  "/admin/calendars": undefined,
  "/admin/bookings": undefined,
  "/admin/waivers": "waivers",
  "/admin/discounts": "discounts",
  "/admin/customers": undefined,
  "/admin/financials": "financials",
  "/admin/ads": "adsAttribution",
  "/admin/emails": undefined,
  "/admin/integrations": "marketplaceSync",
  "/admin/team": "teamOps",
  "/admin/audit": undefined,
  "/admin/system-alerts": undefined,
  "/admin/pricing-calendar": "pricingCalendar",
};
