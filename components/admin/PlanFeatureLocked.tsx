import Link from "next/link";
import { FEATURE_LABELS, getCustomerPlan } from "@/lib/plan";
import type { FeatureKey } from "@/lib/plan";

export function PlanFeatureLocked({ feature }: { feature: FeatureKey }) {
  const label = FEATURE_LABELS[feature];
  const plan = getCustomerPlan();

  return (
    <div className="rounded-2xl border border-brand-dark/10 bg-white p-8 shadow-sm max-w-lg">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Plan feature</p>
      <h1 className="mt-2 text-2xl font-semibold text-brand-dark">{label} is not on your plan</h1>
      <p className="mt-3 text-sm text-brand-muted leading-relaxed">
        This deployment is on <span className="font-medium text-brand-dark">{plan}</span>. Upgrade to
        Slipstack Full (or enable this as an add-on) to unlock {label.toLowerCase()}. Your boats,
        bookings, and site design stay intact when you upgrade.
      </p>
      <Link
        href="/admin"
        className="mt-6 inline-flex text-sm font-semibold text-brand-primary hover:underline"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
