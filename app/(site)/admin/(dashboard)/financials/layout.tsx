import { PlanFeatureGate } from "@/components/admin/PlanFeatureGate";

export default function FinancialsAdminLayout({ children }: { children: React.ReactNode }) {
  return <PlanFeatureGate feature="financials">{children}</PlanFeatureGate>;
}
