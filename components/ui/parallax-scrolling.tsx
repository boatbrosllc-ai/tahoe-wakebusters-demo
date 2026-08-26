"use client";

import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { cn } from "@/lib/utils";

export type ParallaxLayer = {
  /** 1 = farthest (moves most), 4 = nearest */
  layer: "1" | "2" | "3" | "4";
  yPercent: number;
};

const DEFAULT_LAYERS: ParallaxLayer[] = [
  { layer: "1", yPercent: 70 },
  { layer: "2", yPercent: 55 },
  { layer: "3", yPercent: 40 },
  { layer: "4", yPercent: 10 },
];

type ParallaxScrollingProps = {
  children: React.ReactNode;
  className?: string;
  /** Enable Lenis smooth scroll while this hero is mounted. Default true. */
  enableLenis?: boolean;
  layers?: ParallaxLayer[];
};

/**
 * Osmo-style multi-layer parallax shell.
 * Put `[data-parallax-layers]` inside children; mark layers with `data-parallax-layer="1"|"2"|"3"|"4"`.
 */
export function ParallaxScrolling({
  children,
  className,
  enableLenis = true,
  layers = DEFAULT_LAYERS,
}: ParallaxScrollingProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const root = rootRef.current;
    if (!root) return;

    const triggerElement = root.querySelector("[data-parallax-layers]");
    const tweens: gsap.core.Tween[] = [];
    let tl: gsap.core.Timeline | null = null;

    if (triggerElement) {
      tl = gsap.timeline({
        scrollTrigger: {
          trigger: triggerElement,
          start: "0% 0%",
          end: "100% 0%",
          scrub: 0,
        },
      });

      layers.forEach((layerObj, idx) => {
        const targets = triggerElement.querySelectorAll(`[data-parallax-layer="${layerObj.layer}"]`);
        if (!targets.length) return;
        tl!.to(
          targets,
          {
            yPercent: layerObj.yPercent,
            ease: "none",
          },
          idx === 0 ? undefined : "<"
        );
      });
    }

    let lenis: Lenis | null = null;
    let tickerFn: ((time: number) => void) | null = null;

    if (enableLenis) {
      lenis = new Lenis({
        duration: 1.1,
        smoothWheel: true,
      });
      lenis.on("scroll", ScrollTrigger.update);
      tickerFn = (time: number) => {
        lenis?.raf(time * 1000);
      };
      gsap.ticker.add(tickerFn);
      gsap.ticker.lagSmoothing(0);
    }

    return () => {
      tl?.kill();
      tweens.forEach((t) => t.kill());
      ScrollTrigger.getAll().forEach((st) => {
        if (st.trigger === triggerElement || root.contains(st.trigger as Node)) st.kill();
      });
      if (tickerFn) gsap.ticker.remove(tickerFn);
      lenis?.destroy();
    };
  }, [enableLenis, layers]);

  return (
    <div ref={rootRef} className={cn("parallax-scrolling", className)}>
      {children}
    </div>
  );
}

/** @deprecated Prefer ParallaxScrolling — kept for demo paste compatibility. */
export function ParallaxComponent() {
  return (
    <ParallaxScrolling>
      <section className="relative h-[160vh] overflow-hidden bg-brand-dark">
        <div data-parallax-layers className="sticky top-0 h-screen overflow-hidden">
          <img
            src="https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1600&q=80"
            alt=""
            data-parallax-layer="1"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
          <img
            src="https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?auto=format&fit=crop&w=1600&q=80"
            alt=""
            data-parallax-layer="2"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-90"
          />
          <div data-parallax-layer="3" className="absolute inset-0 z-10 flex items-center justify-center">
            <h2 className="font-display text-5xl font-bold text-white md:text-7xl">Parallax</h2>
          </div>
          <img
            src="https://images.unsplash.com/photo-1500514966906-fe245ee13382?auto=format&fit=crop&w=1600&q=80"
            alt=""
            data-parallax-layer="4"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40 mix-blend-lighten"
          />
        </div>
      </section>
    </ParallaxScrolling>
  );
}
