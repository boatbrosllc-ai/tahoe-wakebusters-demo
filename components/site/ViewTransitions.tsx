"use client";

import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type PendingNav = { targetPath: string; resolve: () => void };

/**
 * Intercepts same-origin link clicks and runs navigation inside
 * document.startViewTransition() when supported, for smooth crossfade/slide.
 * NavProgress still shows during the transition; CSS styles the old/new snapshots.
 *
 * Note: This component is not mounted from `SiteChrome` — view transitions stay opt-in until wired up.
 */
export function ViewTransitions({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const pendingNavRef = useRef<PendingNav | null>(null);

  useEffect(() => {
    pathnameRef.current = pathname;
    const p = pendingNavRef.current;
    if (p && pathname === p.targetPath) {
      p.resolve();
      pendingNavRef.current = null;
    }
  }, [pathname]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (!anchor || e.button !== 0) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      try {
        const url = new URL(anchor.href);
        if (url.origin !== window.location.origin) return;
        const targetPath = url.pathname;
        if (targetPath === pathnameRef.current) return;

        e.preventDefault();

        const run = () => {
          router.push(href);
          return new Promise<void>((resolve) => {
            let settled = false;
            const done = () => {
              if (settled) return;
              settled = true;
              clearTimeout(quickFallback);
              pendingNavRef.current = null;
              resolve();
            };
            const quickFallback = setTimeout(done, 400);
            pendingNavRef.current = { targetPath, resolve: done };
          });
        };

        if (typeof document !== "undefined" && "startViewTransition" in document) {
          (document as Document & { startViewTransition?(cb: () => Promise<void>): void }).startViewTransition!(run);
        } else {
          void run();
        }
      } catch {
        // let default navigation happen
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [router]);

  return <>{children}</>;
}
