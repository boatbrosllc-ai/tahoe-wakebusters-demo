import { PlanFeatureGate } from "@/components/admin/PlanFeatureGate";

export default function BlogAdminLayout({ children }: { children: React.ReactNode }) {
  return <PlanFeatureGate feature="blogStudio">{children}</PlanFeatureGate>;
}
