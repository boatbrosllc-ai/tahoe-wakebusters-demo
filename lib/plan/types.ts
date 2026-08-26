/**
 * Customer plan + feature keys for Slipstack Lite / Full.
 *
 * Plans choose a default entitlement set. Optional per-feature overrides on
 * `siteConfig.features` (or launch-packet `featureOverrides`) enable add-ons later
 * without scattering `if (plan === "lite")` checks.
 */

export const PLAN_IDS = ["lite", "full"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/** Backward-compatible default when `plan` is missing on legacy customer repos. */
export const DEFAULT_PLAN: PlanId = "full";

/**
 * Gated product capabilities. Core booking/admin always ship; these flags only
 * cover premium modules (and stubs that are not sold until implemented).
 */
export const FEATURE_KEYS = [
  "waivers",
  "discounts",
  "smsReminders",
  "blogStudio",
  "packages",
  "pricingCalendar",
  "financials",
  "advancedRefunds",
  /** Team invites, captains, operator notes */
  "teamOps",
  /** Gmail marketplace inbox sync */
  "marketplaceSync",
  /** Customer CRM profiles / segments */
  "crm",
  /** First-party ads attribution dashboard */
  "adsAttribution",
  /** Declared capability stubs — not sold as complete products. */
  "googleAuth",
  "paypal",
  "giftCards",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type FeatureFlags = Record<FeatureKey, boolean>;

export type FeatureOverrides = Partial<FeatureFlags>;
