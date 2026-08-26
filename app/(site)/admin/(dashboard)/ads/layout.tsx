import { PlanFeatureGate } from "@/components/admin/PlanFeatureGate";

export default function AdsAdminLayout({ children }: { children: React.ReactNode }) {
  return <PlanFeatureGate feature="adsAttribution">{children}</PlanFeatureGate>;
}
