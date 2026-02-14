"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Prefetches critical routes after the home page has loaded so the first click to
 * Experiences or Pontoon is faster. Runs only on "/" and after a short delay to avoid
 * competing with LCP and initial paint.
 */
const CRITICAL_ROUTES = ["/experiences", "/experiences/lake-austin-pontoon"] as const;

export function PrefetchCriticalRoutes() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname !== "/") return;
    const t = setTimeout(() => {
      CRITICAL_ROUTES.forEach((href) => {
        try {
          router.prefetch(href);
        } catch {
          // ignore
        }
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [pathname, router]);

  return null;
}
