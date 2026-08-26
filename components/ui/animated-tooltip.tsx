"use client";

import Image from "next/image";
import React, { useState } from "react";
import {
  motion,
  useTransform,
  AnimatePresence,
  useMotionValue,
  useSpring,
} from "framer-motion";
import { cn } from "@/lib/utils";

export type AnimatedTooltipItem = {
  id: number;
  name: string;
  designation: string;
  image: string;
};

export const AnimatedTooltip = ({
  items,
  className,
  avatarClassName,
  itemClassName,
}: {
  items: AnimatedTooltipItem[];
  className?: string;
  avatarClassName?: string;
  itemClassName?: string;
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const springConfig = { stiffness: 100, damping: 5 };
  const x = useMotionValue(0);
  const rotate = useSpring(useTransform(x, [-100, 100], [-45, 45]), springConfig);
  const translateX = useSpring(useTransform(x, [-100, 100], [-50, 50]), springConfig);

  const handleMouseMove = (event: React.MouseEvent<HTMLImageElement>) => {
    const halfWidth = event.currentTarget.offsetWidth / 2;
    x.set(event.nativeEvent.offsetX - halfWidth);
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {items.map((item) => (
        <div
          className={cn("-mr-4 relative group", itemClassName)}
          key={item.name}
          onMouseEnter={() => setHoveredIndex(item.id)}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <AnimatePresence mode="popLayout">
            {hoveredIndex === item.id && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.6 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: {
                    type: "spring",
                    stiffness: 260,
                    damping: 10,
                  },
                }}
                exit={{ opacity: 0, y: 20, scale: 0.6 }}
                style={{
                  translateX,
                  rotate,
                  whiteSpace: "nowrap",
                }}
                className="absolute -top-16 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center justify-center rounded-md bg-brand-dark px-4 py-2 text-xs shadow-xl"
              >
                <div className="absolute inset-x-10 -bottom-px z-30 h-px w-[20%] bg-gradient-to-r from-transparent via-brand-primary to-transparent" />
                <div className="absolute left-10 -bottom-px z-30 h-px w-[40%] bg-gradient-to-r from-transparent via-brand-secondary to-transparent" />
                <div className="relative z-30 text-base font-bold text-white">{item.name}</div>
                <div className="text-xs text-white/70">{item.designation}</div>
              </motion.div>
            )}
          </AnimatePresence>
          <Image
            onMouseMove={handleMouseMove}
            height={320}
            width={320}
            src={item.image}
            alt={item.name}
            className={cn(
              "relative h-14 w-14 rounded-full border-2 border-white object-cover object-top !m-0 !p-0 transition duration-500 group-hover:z-30 group-hover:scale-105",
              avatarClassName
            )}
          />
        </div>
      ))}
    </div>
  );
};
