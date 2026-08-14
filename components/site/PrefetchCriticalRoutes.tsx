"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Prefetches critical routes so first clicks are near-instant.
 */
const CRITICAL_ROUTES = [
  "/experiences",
  "/experiences/nasty-half-day",
  "/experiences/nasty-full-day",
  "/booking",
  "/packages",
  "/contact",
  "/location",
] as const;

export function PrefetchCriticalRoutes() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const delay = pathname === "/" ? 400 : 200;
    const t = setTimeout(() => {
      CRITICAL_ROUTES.forEach((href) => {
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
