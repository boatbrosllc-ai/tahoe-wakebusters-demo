"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Thin progress bar at top of viewport during client-side navigation.
 * Shows when user clicks a same-origin link; hides when pathname has updated (new page ready).
 */
const NAV_SAFETY_TIMEOUT_MS = 12_000;

export function NavProgress() {
  const pathname = usePathname();
  const [navigating, setNavigating] = useState(false);
  const prevPathnameRef = useRef(pathname);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (!anchor || !anchor.href) return;
      try {
        const url = new URL(anchor.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;
        if (safetyTimeoutRef.current != null) {
          clearTimeout(safetyTimeoutRef.current);
          safetyTimeoutRef.current = null;
        }
        setNavigating(true);
        safetyTimeoutRef.current = setTimeout(() => {
          safetyTimeoutRef.current = null;
          setNavigating(false);
        }, NAV_SAFETY_TIMEOUT_MS);
      } catch {
        // ignore
      }
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  useEffect(() => {
    if (pathname !== prevPathnameRef.current) {
      prevPathnameRef.current = pathname;
      if (safetyTimeoutRef.current != null) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
      const t = setTimeout(() => setNavigating(false), 0);
      return () => clearTimeout(t);
    }
  }, [pathname]);

  if (!navigating) return null;

  return (
    <div
      className="fixed left-0 top-0 z-[100] w-full h-0.5 bg-brand-primary/20 overflow-hidden nav-progress-bar"
      role="progressbar"
      aria-label="Loading"
    >
      <div className="nav-progress-bar-inner h-full w-1/3 bg-brand-primary" />
    </div>
  );
}
