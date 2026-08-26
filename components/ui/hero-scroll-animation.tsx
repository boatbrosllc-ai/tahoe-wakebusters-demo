"use client";

import { useScroll, useTransform, motion, useReducedMotion, type MotionValue } from "motion/react";
import React, { useRef, forwardRef, type ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export type HeroScrollImage = {
  src: string;
  alt: string;
};

interface SectionProps {
  scrollYProgress: MotionValue<number>;
  reduceMotion: boolean;
}

function HeroLayer({
  scrollYProgress,
  reduceMotion,
  children,
}: SectionProps & { children: ReactNode }) {
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.8]);
  const rotate = useTransform(scrollYProgress, [0, 1], [0, -5]);

  return (
    <motion.section
      style={reduceMotion ? undefined : { scale, rotate }}
      className="sticky top-0 h-[100svh] overflow-hidden"
    >
      {children}
    </motion.section>
  );
}

function PanelLayer({
  scrollYProgress,
  reduceMotion,
  title,
  images,
}: SectionProps & { title: ReactNode; images: HeroScrollImage[] }) {
  const scale = useTransform(scrollYProgress, [0, 1], [0.8, 1]);
  const rotate = useTransform(scrollYProgress, [0, 1], [5, 0]);

  return (
    <motion.section
      style={reduceMotion ? undefined : { scale, rotate }}
      className="relative flex min-h-[100svh] items-center bg-gradient-to-t from-[#06060e] to-[#0a1628] py-16 text-white"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:54px_54px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"
        aria-hidden
      />
      <article className="relative z-10 mx-auto w-full max-w-6xl px-5 sm:px-8">
        <h2 className="max-w-4xl font-display text-3xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
          {title}
        </h2>
        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {images.map((img) => (
            <div
              key={img.src}
              className="relative aspect-[3/4] overflow-hidden rounded-md bg-[#0a1628]"
            >
              <Image
                src={img.src}
                alt={img.alt}
                fill
                sizes="(max-width: 768px) 50vw, 25vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      </article>
    </motion.section>
  );
}

interface HeroScrollAnimationProps {
  hero: ReactNode;
  panelTitle: ReactNode;
  images: HeroScrollImage[];
  className?: string;
}

/**
 * Sticky stacked-scroll hero — ui-layout / 21st.dev hero-scroll-animation.
 * First panel stays pinned and scales down; second panel rotates in.
 */
const HeroScrollAnimation = forwardRef<HTMLElement, HeroScrollAnimationProps>(
  function HeroScrollAnimation({ hero, panelTitle, images, className }, _ref) {
    const container = useRef<HTMLDivElement>(null);
    const reduceMotion = useReducedMotion() ?? false;
    const { scrollYProgress } = useScroll({
      target: container,
      offset: ["start start", "end end"],
    });

    return (
      <div ref={container} className={cn("relative h-[200vh] bg-[#0a1628]", className)}>
        <HeroLayer scrollYProgress={scrollYProgress} reduceMotion={reduceMotion}>
          {hero}
        </HeroLayer>
        <PanelLayer
          scrollYProgress={scrollYProgress}
          reduceMotion={reduceMotion}
          title={panelTitle}
          images={images}
        />
      </div>
    );
  }
);

HeroScrollAnimation.displayName = "HeroScrollAnimation";

export default HeroScrollAnimation;
export { HeroScrollAnimation };
