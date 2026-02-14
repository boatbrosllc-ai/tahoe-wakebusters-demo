"use client";

import { useEffect, useRef, useState } from "react";

const defaultOptions: IntersectionObserverInit = {
  root: null,
  rootMargin: "0px 0px -80px 0px",
  threshold: 0.1,
};

/**
 * Lightweight scroll-in reveal using IntersectionObserver.
 * Returns ref to attach to section and whether it has been revealed.
 * Respect prefers-reduced-motion by revealing immediately when reduced.
 */
export function useSectionReveal(
  options?: Partial<IntersectionObserverInit> & { reducedMotion?: boolean }
) {
  const { reducedMotion = false, ...observerOptions } = options ?? {};
  const ref = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(reducedMotion);

  useEffect(() => {
    if (reducedMotion) {
      setRevealed(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const opts = { ...defaultOptions, ...observerOptions };
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setRevealed(true);
      },
      opts
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [reducedMotion]);

  return { ref, revealed };
}
