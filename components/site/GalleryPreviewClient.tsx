"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const INITIAL_COUNT = 6;

const images = [
  "/photos/IMG_8520.webp",
  "/photos/IMG_3160.webp",
  "/photos/DSC00484.webp",
  "/photos/DSC09399%20(2).webp",
  "/photos/DSC09308%20(2).webp",
  "/photos/DSC09319%20(4).webp",
  "/photos/IMG_9649.webp",
  "/photos/Thomas_2.14.1.webp",
  "/photos/IMG_9647%202.webp",
  "/photos/DSC00539.webp",
  "/photos/IMG_5095.webp",
  "/photos/IMG_5285.webp",
  "/photos/IMG_5116%202.webp",
  "/photos/IMG_0969.webp",
  "/photos/IMG_2123.webp",
  "/photos/IMG_4539.webp",
  "/photos/IMG_8614%202.webp",
  "/photos/DSC00513%20(3).webp",
  "/photos/DSC09321%20(2).webp",
  "/photos/IMG_0386.webp",
  "/photos/IMG_0514.webp",
  "/photos/IMG_1197.webp",
  "/photos/IMG_5120%202.webp",
];

export function GalleryPreviewClient() {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const visibleImages = showAll ? images : images.slice(0, INITIAL_COUNT);
  const moreImages = !showAll ? images.slice(INITIAL_COUNT) : [];
  const hasMore = images.length > INITIAL_COUNT && !showAll;

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxSrc(null);
    };
    if (lightboxSrc) {
      document.addEventListener("keydown", onEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.body.style.overflow = "";
    };
  }, [lightboxSrc]);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
        {visibleImages.map((src, i) => (
          <button
            type="button"
            key={src}
            onClick={() => setLightboxSrc(src)}
            className={cn(
              "group relative aspect-[4/3] rounded-xl sm:rounded-2xl overflow-hidden bg-brand-dark/10 shadow-soft ring-1 ring-brand-dark/5",
              "hover:shadow-xl hover:ring-2 hover:ring-brand-primary/40 transition-all duration-300",
              "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg"
            )}
            aria-label="View photo"
          >
            <Image
              src={src}
              alt=""
              fill
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-110"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              priority={i < INITIAL_COUNT}
            />
          </button>
        ))}
      </div>
      {hasMore && moreImages.length > 0 && (
        <>
          <div className="mt-6 sm:hidden">
            <p className="text-sm text-brand-muted mb-2 px-1">Swipe for more</p>
            <div className="overflow-x-auto overflow-y-hidden scrollbar-hide -mx-5 px-5 pb-2 -webkit-overflow-scrolling-touch">
              <div className="flex gap-3 min-w-max">
                {moreImages.map((src) => (
                  <button
                    type="button"
                    key={src}
                    onClick={() => setLightboxSrc(src)}
                    className="relative shrink-0 w-[180px] aspect-[4/3] rounded-xl overflow-hidden bg-brand-dark/10 shadow-soft ring-1 ring-brand-dark/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg"
                    aria-label="View photo"
                  >
                    <Image
                      src={src}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="180px"
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="inline-flex items-center gap-2 rounded-full border-2 border-brand-primary bg-transparent px-6 py-3 text-brand-primary font-semibold hover:bg-brand-primary hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg"
            >
              Load more photos
            </button>
          </p>
          <p className="mt-2 text-center text-sm text-brand-muted sm:hidden">
            Or tap &quot;Load more&quot; to see all {images.length} in the grid
          </p>
        </>
      )}
      <p className="mt-6 sm:mt-6 text-center">
        <Link
          href="/experiences"
          className="group inline-flex items-center gap-1.5 text-brand-primary font-medium hover:text-brand-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded-lg underline-offset-4 hover:underline"
        >
          See all experiences
          <span className="inline-block group-hover:translate-x-0.5 transition-transform duration-200" aria-hidden>
            →
          </span>
        </Link>
      </p>

      <AnimatePresence>
        {lightboxSrc ? (
          <GalleryLightbox key={lightboxSrc} src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
        ) : null}
      </AnimatePresence>
    </>
  );
}

function GalleryLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Photo view"
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
        className="relative w-[90vw] max-w-6xl h-[85vh] max-h-[85vh] rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/20 flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <Image src={src} alt="" fill className="object-contain" sizes="90vw" priority />
      </motion.div>
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2.5 rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        aria-label="Close"
      >
        <X className="h-6 w-6" />
      </button>
    </motion.div>
  );
}
