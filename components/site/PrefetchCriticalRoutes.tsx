"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Prefetches critical routes so the first click to key pages is near-instant.
 * Runs after a short delay to avoid competing with LCP; also runs on high-traffic pages.
 */
const CRITICAL_ROUTES = [
  "/experiences",
  "/experiences/lake-austin-pontoon",
  "/booking",
  "/contact",
  "/lake-austin-pontoon-rentals",
  "/lake-austin-boat-rental",
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
