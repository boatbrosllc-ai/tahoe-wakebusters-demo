"use client";

import { isPlatformDevBannerEnabled, siteConfig } from "@/config/site";

/** Non-production identity strip showing the active customer site. */
export function PlatformDevBanner() {
  if (!isPlatformDevBannerEnabled()) return null;
  const isDemo = siteConfig.tenantId.includes("demo");
  return (
    <div
      className="bg-brand-dark text-white/90 text-[11px] sm:text-xs px-4 py-1.5 text-center tracking-wide border-b border-white/10"
      role="status"
    >
      {isDemo ? (
        <>
          Preview demo · {siteConfig.company.name} · Not the live customer site · Tenant:{" "}
          {siteConfig.tenantId}
        </>
      ) : (
        <>
          Tenant: {siteConfig.tenantId} · Company: {siteConfig.company.name} · Environment:{" "}
          {siteConfig.environment}
        </>
      )}
    </div>
  );
}
