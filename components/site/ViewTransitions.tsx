"use client";

import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Intercepts same-origin link clicks and runs navigation inside
 * document.startViewTransition() when supported, for smooth crossfade/slide.
 * NavProgress still shows during the transition; CSS styles the old/new snapshots.
 */
export function ViewTransitions({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
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
        const targetPath = url.pathname + url.search;
        if (targetPath === pathnameRef.current) return;

        e.preventDefault();

        const run = () => {
          router.push(href);
          return new Promise<void>((resolve) => {
            const start = Date.now();
            const max = 8000;
            const check = () => {
              if (pathnameRef.current === url.pathname) {
                resolve();
                return;
              }
              if (Date.now() - start > max) {
                resolve();
                return;
              }
              requestAnimationFrame(check);
            };
            requestAnimationFrame(check);
          });
        };

        if (typeof document !== "undefined" && "startViewTransition" in document) {
          (document as Document & { startViewTransition?(cb: () => Promise<void>): void }).startViewTransition!(run);
        } else {
          run();
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
