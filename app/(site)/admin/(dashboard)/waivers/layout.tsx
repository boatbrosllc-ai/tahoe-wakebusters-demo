"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { FileText, ClipboardList } from "lucide-react";
import { PlanFeatureGate } from "@/components/admin/PlanFeatureGate";

export default function WaiversLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const tabs = [
    { href: "/admin/waivers/templates", label: "Templates", icon: FileText },
    { href: "/admin/waivers/requests", label: "Tracking", icon: ClipboardList },
  ];

  return (
    <PlanFeatureGate feature="waivers">
      <div className="space-y-6">
        <nav className="flex gap-1 p-1 rounded-xl bg-brand-dark/5 border border-brand-dark/10 w-fit">
          {tabs.map((tab) => {
            const isActive =
              pathname === tab.href ||
              (tab.href !== "/admin/waivers" && pathname.startsWith(tab.href + "/"));
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-white text-brand-dark shadow-sm"
                    : "text-brand-muted hover:text-brand-dark hover:bg-white/50"
                )}
              >
                <tab.icon className="h-4 w-4" aria-hidden />
                {tab.label}
              </Link>
            );
          })}
        </nav>
        {children}
      </div>
    </PlanFeatureGate>
  );
}
