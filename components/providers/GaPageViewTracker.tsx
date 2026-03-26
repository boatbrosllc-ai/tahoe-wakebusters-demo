"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { sendGaFallbackEvent } from "@/lib/ga-fallback-client";

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
  const pathnameRef = useRef(pathname ?? "/");
  pathnameRef.current = pathname ?? "/";

  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gtagExhaustWarnedRef = useRef(false);

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

    const sendPageView = async (path: string) => {
      const payload = {
        page_path: path,
        page_location: window.location.href,
        page_title: document.title,
      };
      if (typeof w.gtag === "function") {
        w.gtag("event", "page_view", payload);
        return;
      }
      await sendGaFallbackEvent("page_view", payload);
    };

    if (typeof w.gtag === "function") {
      void sendPageView(pagePath);
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
        void sendPageView(pagePathRef.current);
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
        if (!gtagExhaustWarnedRef.current) {
          gtagExhaustWarnedRef.current = true;
          void sendGaFallbackEvent("page_view", {
            page_path: pagePathRef.current,
            page_location: window.location.href,
            page_title: document.title,
            transport: "fallback_after_gtag_timeout",
          });
          console.warn(
            "[GaPageViewTracker] gtag did not become available after max retry attempts; page_view tracking may be missing.",
            { pagePath: pagePathRef.current, pathname: pathnameRef.current }
          );
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

