"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { hasFeature } from "@/lib/plan";

/**
 * Prefetches critical routes so first clicks are near-instant.
 */
const CRITICAL_ROUTES = [
  "/experiences",
  "/experiences/half-day",
  "/experiences/full-day",
  "/booking",
  "/contact",
  "/location",
] as const;

export function PrefetchCriticalRoutes() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const delay = pathname === "/" ? 400 : 200;
    const t = setTimeout(() => {
      const routes = [
        ...CRITICAL_ROUTES,
        ...(hasFeature("packages") ? (["/packages"] as const) : []),
      ];
      routes.forEach((href) => {
        if (href === pathname) return;
        try {
          router.prefetch(href);
        } catch {
          // ignore
        }
      });
    }, delay);
    return () => clearTimeout(t);
  }, [pathname, router]);

  return null;
}
