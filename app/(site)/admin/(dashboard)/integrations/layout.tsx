import { PlanFeatureGate } from "@/components/admin/PlanFeatureGate";

export default function IntegrationsAdminLayout({ children }: { children: React.ReactNode }) {
  return <PlanFeatureGate feature="marketplaceSync">{children}</PlanFeatureGate>;
}
