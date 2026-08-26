import { hasFeature } from "@/lib/plan";
import type { FeatureKey } from "@/lib/plan";
import { PlanFeatureLocked } from "@/components/admin/PlanFeatureLocked";

/** Server or client: hide premium admin pages when the plan does not include them. */
export function PlanFeatureGate({
  feature,
  children,
}: {
  feature: FeatureKey;
  children: React.ReactNode;
}) {
  if (!hasFeature(feature)) {
    return <PlanFeatureLocked feature={feature} />;
  }
  return children;
}
