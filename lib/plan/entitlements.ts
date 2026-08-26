import {
  DEFAULT_PLAN,
  FEATURE_KEYS,
  type FeatureFlags,
  type FeatureKey,
  type FeatureOverrides,
  type PlanId,
  PLAN_IDS,
} from "@/lib/plan/types";

/**
 * Central source of truth: which features each plan includes by default.
 *
 * Core (always on): branded site, boats/trips, booking engine, Stripe checkout,
 * deposits, basic pricing, confirmations, calendar/blocks, cancel/reschedule,
 * contact/FAQ/location, customers list, email notifications, discounts, pricing calendar.
 */
const LITE_FEATURES: FeatureFlags = {
  waivers: false,
  discounts: true,
  smsReminders: false,
  blogStudio: false,
  packages: false,
  pricingCalendar: true,
  financials: false,
  advancedRefunds: false,
  teamOps: false,
  marketplaceSync: false,
  crm: false,
  adsAttribution: false,
  googleAuth: true,
  paypal: false,
  giftCards: false,
};

const FULL_FEATURES: FeatureFlags = {
  waivers: true,
  discounts: true,
  smsReminders: true,
  blogStudio: true,
  packages: true,
  pricingCalendar: true,
  financials: true,
  advancedRefunds: true,
  teamOps: true,
  marketplaceSync: true,
  crm: true,
  adsAttribution: true,
  googleAuth: true,
  paypal: false,
  giftCards: false,
};

export const PLAN_FEATURE_DEFAULTS: Record<PlanId, FeatureFlags> = {
  lite: LITE_FEATURES,
  full: FULL_FEATURES,
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  waivers: "Waivers",
  discounts: "Discount codes",
  smsReminders: "SMS reminders",
  blogStudio: "Blog Studio",
  packages: "Packages",
  pricingCalendar: "Pricing calendar",
  financials: "Financials",
  advancedRefunds: "Advanced refund tools",
  teamOps: "Team & captains",
  marketplaceSync: "Marketplace Sync",
  crm: "Customer CRM",
  adsAttribution: "Ads attribution",
  googleAuth: "Google auth",
  paypal: "PayPal",
  giftCards: "Gift cards",
};

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as readonly string[]).includes(value);
}

export function normalizePlan(value: unknown): PlanId {
  return isPlanId(value) ? value : DEFAULT_PLAN;
}

export function resolveFeatureFlags(plan: PlanId, overrides?: FeatureOverrides | null): FeatureFlags {
  const base = PLAN_FEATURE_DEFAULTS[plan];
  if (!overrides) return { ...base };
  const next = { ...base };
  for (const key of FEATURE_KEYS) {
    const v = overrides[key];
    if (typeof v === "boolean") next[key] = v;
  }
  return next;
}

export function mergeFeatureOverrideSources(
  legacyFeatures?: FeatureOverrides | null,
  featureOverrides?: FeatureOverrides | null,
): FeatureOverrides {
  return {
    ...(legacyFeatures ?? {}),
    ...(featureOverrides ?? {}),
  };
}
