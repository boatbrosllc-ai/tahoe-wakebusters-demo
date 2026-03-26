"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function buildPagePath(pathname: string, searchParams: URLSearchParams | ReturnType<typeof useSearchParams>) {
  const search = searchParams.toString();
  return `${pathname}${search ? `?${search}` : ""}`;
}

const GTAG_FLUSH_INTERVAL_MS = 50;
const GTAG_FLUSH_MAX_ATTEMPTS = 100;

export function GaPageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pagePath = useMemo(() => {
    // `useSearchParams()` can briefly be empty; still produce a stable value for dedupe.
    return buildPagePath(pathname ?? "/", searchParams ?? new URLSearchParams());
  }, [pathname, searchParams]);

  const didInitialRender = useRef(false);
  const pagePathRef = useRef(pagePath);
  pagePathRef.current = pagePath;

  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    const sendPageView = (path: string) => {
      w.gtag!("event", "page_view", {
        page_path: path,
        page_location: window.location.href,
        page_title: document.title,
      });
    };

    if (typeof w.gtag === "function") {
      sendPageView(pagePath);
      return;
    }

    if (flushIntervalRef.current) {
      clearInterval(flushIntervalRef.current);
      flushIntervalRef.current = null;
    }

    let attempts = 0;
    flushIntervalRef.current = setInterval(() => {
      attempts += 1;
      if (typeof w.gtag === "function") {
        sendPageView(pagePathRef.current);
        if (flushIntervalRef.current) {
          clearInterval(flushIntervalRef.current);
          flushIntervalRef.current = null;
        }
        return;
      }
      if (attempts >= GTAG_FLUSH_MAX_ATTEMPTS) {
        if (flushIntervalRef.current) {
          clearInterval(flushIntervalRef.current);
          flushIntervalRef.current = null;
        }
      }
    }, GTAG_FLUSH_INTERVAL_MS);

    return () => {
      if (flushIntervalRef.current) {
        clearInterval(flushIntervalRef.current);
        flushIntervalRef.current = null;
      }
    };
  }, [pagePath]);

  return null;
}

