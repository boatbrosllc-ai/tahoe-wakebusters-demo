import { NextResponse } from "next/server";
import { FEATURE_LABELS, normalizePlan } from "@/lib/plan/entitlements";
import { getCustomerPlan, hasFeature } from "@/lib/plan/has-feature";
import type { FeatureKey } from "@/lib/plan/types";

export type PlanFeatureDeniedBody = {
  error: string;
  code: "plan_feature_disabled";
  feature: FeatureKey;
  featureLabel: string;
  plan: string;
};

export function planFeatureDeniedBody(feature: FeatureKey): PlanFeatureDeniedBody {
  return {
    error: `${FEATURE_LABELS[feature]} is not included in your Slipstack plan.`,
    code: "plan_feature_disabled",
    feature,
    featureLabel: FEATURE_LABELS[feature],
    plan: getCustomerPlan(),
  };
}

/** API guard: returns 403 JSON when the feature is off. */
export function requireFeatureResponse(feature: FeatureKey): NextResponse | null {
  if (hasFeature(feature)) return null;
  return NextResponse.json(planFeatureDeniedBody(feature), { status: 403 });
}

/**
 * Cron-safe skip: do not 403 (scheduler would look broken); return a JSON skip payload.
 * Caller should `return` this response when non-null.
 */
export function skipCronIfFeatureDisabled(feature: FeatureKey): NextResponse | null {
  if (hasFeature(feature)) return null;
  return NextResponse.json({
    skipped: true,
    reason: "plan_feature_disabled",
    feature,
    plan: normalizePlan(getCustomerPlan()),
  });
}
