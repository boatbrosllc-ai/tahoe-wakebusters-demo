"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function buildPagePath(pathname: string, searchParams: URLSearchParams | ReadonlyURLSearchParams) {
  const search = searchParams.toString();
  return `${pathname}${search ? `?${search}` : ""}`;
}

export function GaPageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pagePath = useMemo(() => {
    // `useSearchParams()` can briefly be empty; still produce a stable value for dedupe.
    return buildPagePath(pathname ?? "/", searchParams ?? new URLSearchParams());
  }, [pathname, searchParams]);

  const didInitialRender = useRef(false);

  useEffect(() => {
    // De-dupe: `gtag('config', ...)` sends the initial `page_view` automatically on first load.
    if (!didInitialRender.current) {
      didInitialRender.current = true;
      return;
    }

    if (typeof window === "undefined") return;

    const w = window as unknown as {
      gtag?: (...args: unknown[]) => void;
    };

    if (typeof w.gtag !== "function") return; // GA may be disabled; only track when `gtag` exists.

    w.gtag("event", "page_view", {
      page_path: pagePath,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pagePath]);

  return null;
}

