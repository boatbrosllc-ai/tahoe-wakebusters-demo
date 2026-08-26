"use client";

import * as React from "react";
import Image from "next/image";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

import { cn } from "@/lib/utils";

export interface ParallaxTiltCardProps {
  /**
   * The main title of the card.
   */
  title: string;
  /**
   * A short description displayed under the title.
   */
  description: string;
  /**
   * The URL for the primary image to be displayed prominently on the card.
   */
  imageUrl: string;
  /**
   * Optional class names for extending or overriding the component's styles.
   */
  className?: string;
}

const ParallaxTiltCard = React.forwardRef<HTMLDivElement, ParallaxTiltCardProps>(
  ({ title, description, imageUrl, className }, ref) => {
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const mouseXSpring = useSpring(x, { stiffness: 300, damping: 30, bounce: 0 });
    const mouseYSpring = useSpring(y, { stiffness: 300, damping: 30, bounce: 0 });

    const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["17.5deg", "-17.5deg"]);
    const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-17.5deg", "17.5deg"]);

    const translateZImage = useTransform(mouseYSpring, [-0.5, 0.5], [-25, 25]);
    const translateZContent = useTransform(mouseYSpring, [-0.5, 0.5], [25, -25]);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const { width, height, left, top } = rect;
      const mouseX = e.clientX - left;
      const mouseY = e.clientY - top;

      const xPct = mouseX / width - 0.5;
      const yPct = mouseY / height - 0.5;

      x.set(xPct);
      y.set(yPct);
    };

    const handleMouseLeave = () => {
      x.set(0);
      y.set(0);
    };

    return (
      <motion.div
        ref={ref}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          rotateY,
          rotateX,
          transformStyle: "preserve-3d",
        }}
        className={cn(
          "relative h-80 w-72 rounded-2xl bg-gradient-to-br from-brand-primary/10 to-brand-primary/30",
          className
        )}
      >
        <div
          style={{
            transform: "translateZ(50px)",
            transformStyle: "preserve-3d",
          }}
          className="absolute inset-4 grid grid-rows-[1fr_auto] overflow-hidden rounded-xl bg-white shadow-lg"
        >
          <motion.div
            style={{
              transform: "translateZ(40px)",
              translateY: translateZImage,
            }}
            className="relative h-full min-h-[9rem] w-full"
          >
            <Image
              src={imageUrl}
              alt={title}
              fill
              sizes="(max-width: 640px) 90vw, 320px"
              className="pointer-events-none object-cover"
            />
          </motion.div>

          <motion.div
            style={{
              transform: "translateZ(30px)",
              translateY: translateZContent,
            }}
            className="bg-white p-5 pt-4 text-center"
          >
            <h3 className="font-display text-xl font-bold text-brand-dark">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-brand-muted">{description}</p>
          </motion.div>
        </div>
      </motion.div>
    );
  }
);
ParallaxTiltCard.displayName = "ParallaxTiltCard";

export { ParallaxTiltCard };
