"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { GALLERY_IMAGES, GALLERY_CATEGORIES } from "@/lib/experience/lakeAustinPontoon.data";
import { getDisplayImageUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";

export interface GalleryImageItem {
  url: string;
  alt?: string;
}

export function GalleryMosaic({ id = "gallery", images: imagesProp }: { id?: string; images?: GalleryImageItem[] }) {
  const reduceMotion = useReducedMotion();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  const images = useMemo(() => {
    if (Array.isArray(imagesProp)) {
      return imagesProp.map(({ url, alt }) => ({ url: getDisplayImageUrl(url), alt: alt ?? "" }));
    }
    return GALLERY_IMAGES.map((img) => ({ url: img.url, alt: img.alt }));
  }, [imagesProp]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selectedIndex == null) return;
      if (e.key === "Escape") setSelectedIndex(null);
      if (e.key === "ArrowLeft")
        setSelectedIndex((i) => (i === null ? null : (i - 1 + images.length) % images.length));
      if (e.key === "ArrowRight")
        setSelectedIndex((i) => (i === null ? null : (i + 1) % images.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIndex, images.length]);

  useEffect(() => {
    if (selectedIndex != null) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedIndex]);

  const main = images[0];
  const rest = images.slice(1, 5);
  const showCategoryFilter = !Array.isArray(imagesProp);

  if (Array.isArray(imagesProp) && imagesProp.length === 0) {
    return null;
  }

  return (
    <section id={id} className="bg-brand-dark py-16 sm:py-20 lg:py-24">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
        <motion.h2
          className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight mb-6"
          initial={reduceMotion ? false : { opacity: 0, y: 20 }}
          whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          Gallery
        </motion.h2>
        {showCategoryFilter && (
        <div className="flex flex-wrap gap-2 mb-8">
          {GALLERY_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(category === c ? null : c)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark",
                category === c
                  ? "bg-brand-primary text-brand-dark"
                  : "bg-white/10 text-white/90 hover:bg-white/20 border border-white/20"
              )}
            >
              {c}
            </button>
          ))}
        </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {main && (
          <motion.button
            type="button"
            className="relative aspect-[4/3] rounded-xl overflow-hidden col-span-2 row-span-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
            whileInView={reduceMotion ? {} : { opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            whileHover={reduceMotion ? {} : { scale: 1.02 }}
            onClick={() => setSelectedIndex(0)}
          >
            <Image
              src={main.url}
              alt={main.alt}
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 hover:opacity-100 transition-opacity" />
          </motion.button>
          )}
          {rest.map((img, i) => (
            <motion.button
              key={`${img.url}-${i}`}
              type="button"
              className="relative aspect-[4/3] rounded-xl overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark"
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.05 * (i + 1) }}
              whileHover={reduceMotion ? {} : { scale: 1.05 }}
              onClick={() => setSelectedIndex(i + 1)}
            >
              <Image
                src={img.url}
                alt={img.alt}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 50vw, 25vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 hover:opacity-100 transition-opacity" />
            </motion.button>
          ))}
        </div>
      </div>

      {/* Fullscreen modal */}
      <AnimatePresence>
        {selectedIndex !== null && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSelectedIndex(null)}
          >
            <button
              type="button"
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              onClick={() => setSelectedIndex(null)}
              aria-label="Close gallery"
            >
              <X className="h-6 w-6" />
            </button>
            <button
              type="button"
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedIndex((i) => (i == null ? images.length - 1 : (i - 1 + images.length) % images.length));
              }}
              aria-label="Previous image"
            >
              <ChevronLeft className="h-8 w-8" />
            </button>
            <button
              type="button"
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedIndex((i) => (i == null ? 0 : (i + 1) % images.length));
              }}
              aria-label="Next image"
            >
              <ChevronRight className="h-8 w-8" />
            </button>
            <motion.div
              className="relative w-full max-w-5xl aspect-video"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              key={selectedIndex}
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={images[selectedIndex]?.url ?? ""}
                alt={images[selectedIndex]?.alt ?? ""}
                fill
                className="object-contain"
                sizes="100vw"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
