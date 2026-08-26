import { PlanFeatureGate } from "@/components/admin/PlanFeatureGate";

export default function TeamAdminLayout({ children }: { children: React.ReactNode }) {
  return <PlanFeatureGate feature="teamOps">{children}</PlanFeatureGate>;
}
