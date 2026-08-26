"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  motion,
  useScroll,
  useTransform,
  useInView,
  AnimatePresence,
} from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type BentoGalleryImageItem = {
  id: number | string;
  title: string;
  desc: string;
  url: string;
  span: string;
};

interface InteractiveImageBentoGalleryProps {
  imageItems: BentoGalleryImageItem[];
  title: string;
  description: string;
  className?: string;
  eyebrow?: string;
}

function ImageModal({
  item,
  onClose,
}: {
  item: BentoGalleryImageItem;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0a1628]/85 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
    >
      <motion.div
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 16 }}
        className="relative mx-4 w-full max-w-5xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-brand-dark">
          <Image
            src={item.url}
            alt={item.title}
            fill
            sizes="100vw"
            className="object-contain"
            priority
          />
        </div>
        <div className="mt-3 text-center">
          <p className="font-display text-lg font-bold text-white">{item.title}</p>
          <p className="text-sm text-white/70">{item.desc}</p>
        </div>
      </motion.div>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white/90 transition hover:bg-white/20 hover:text-white"
        aria-label="Close image view"
      >
        <X size={22} />
      </button>
    </motion.div>
  );
}

/**
 * Draggable two-row bento — mixed tall/short tiles, click to expand.
 */
export default function InteractiveImageBentoGallery({
  imageItems,
  title,
  description,
  className,
  eyebrow,
}: InteractiveImageBentoGalleryProps) {
  const [selectedItem, setSelectedItem] = useState<BentoGalleryImageItem | null>(null);
  const [dragConstraint, setDragConstraint] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLElement>(null);
  const pointerStart = useRef({ x: 0, y: 0 });
  const galleryInView = useInView(containerRef, { once: true, amount: 0.2 });

  useEffect(() => {
    const calculateConstraints = () => {
      if (gridRef.current && containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const gridWidth = gridRef.current.scrollWidth;
        setDragConstraint(Math.min(0, containerWidth - gridWidth - 32));
      }
    };

    calculateConstraints();
    const timer = window.setTimeout(calculateConstraints, 400);
    window.addEventListener("resize", calculateConstraints);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", calculateConstraints);
    };
  }, [imageItems]);

  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start end", "end start"],
  });
  const opacity = useTransform(scrollYProgress, [0, 0.15, 0.85, 1], [0, 1, 1, 0]);
  const y = useTransform(scrollYProgress, [0, 0.15], [24, 0]);

  return (
    <section
      ref={targetRef}
      className={cn("relative w-full overflow-hidden bg-brand-dark pb-16 pt-10 sm:pb-24 sm:pt-14", className)}
      aria-label={title}
    >
      <motion.div style={{ opacity, y }} className="mx-auto max-w-3xl px-5 text-center sm:px-8">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-primary">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
          {title}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-base text-white/80 sm:text-lg">{description}</p>
        <p className="mt-2 text-xs font-medium text-white/60">
          Drag to explore · Click to expand
        </p>
      </motion.div>

      <div
        ref={containerRef}
        className="relative mt-10 w-full cursor-grab select-none active:cursor-grabbing sm:mt-12"
      >
        <motion.div
          className="w-max min-w-full"
          drag="x"
          dragConstraints={{ left: dragConstraint, right: 0 }}
          dragElastic={0.05}
        >
          <div
            ref={gridRef}
            className="grid auto-cols-[minmax(15rem,18rem)] grid-flow-col grid-rows-2 gap-3 px-4 sm:auto-cols-[minmax(16rem,20rem)] sm:gap-4 sm:px-6 lg:px-8"
            style={{ height: "min(70vh, 520px)" }}
          >
            {imageItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 16 }}
                animate={
                  galleryInView
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0, y: 16 }
                }
                transition={{
                  type: "spring",
                  stiffness: 100,
                  damping: 16,
                  delay: Math.min(index, 12) * 0.045,
                }}
                className={cn(
                  "group relative flex h-full min-h-0 w-full cursor-pointer items-end overflow-hidden rounded-2xl border border-white/10 bg-brand-dark shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary",
                  item.span
                )}
                whileHover={{ scale: 1.015 }}
                onPointerDown={(e) => {
                  pointerStart.current = { x: e.clientX, y: e.clientY };
                }}
                onClick={(e) => {
                  const dx = Math.abs(e.clientX - pointerStart.current.x);
                  const dy = Math.abs(e.clientY - pointerStart.current.y);
                  if (dx > 8 || dy > 8) return;
                  setSelectedItem(item);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedItem(item);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`View ${item.title}`}
              >
                <Image
                  src={item.url}
                  alt={item.title}
                  fill
                  sizes="320px"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  draggable={false}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a1628]/85 via-[#0a1628]/25 to-transparent opacity-70 transition-opacity duration-400 group-hover:opacity-95" />
                <div className="relative z-10 p-4 transition-all duration-400 sm:translate-y-2 sm:opacity-90 sm:group-hover:translate-y-0 sm:group-hover:opacity-100">
                  <h3 className="font-display text-base font-bold text-white sm:text-lg">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-sm text-white/80">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {selectedItem ? (
          <ImageModal item={selectedItem} onClose={() => setSelectedItem(null)} />
        ) : null}
      </AnimatePresence>
    </section>
  );
}
