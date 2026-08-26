import { PlanFeatureGate } from "@/components/admin/PlanFeatureGate";

export default function DiscountsAdminLayout({ children }: { children: React.ReactNode }) {
  return <PlanFeatureGate feature="discounts">{children}</PlanFeatureGate>;
}
