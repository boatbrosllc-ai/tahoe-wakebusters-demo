import { PlanFeatureGate } from "@/components/admin/PlanFeatureGate";

export default function PricingCalendarAdminLayout({ children }: { children: React.ReactNode }) {
  return <PlanFeatureGate feature="pricingCalendar">{children}</PlanFeatureGate>;
}
