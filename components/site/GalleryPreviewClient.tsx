"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

/** Real NSF / Cabo charter gallery — catch shots, boat, marina, gear. */
const GALLERY_IMAGES = [
  "/photos/nsf/sailfish-baitball.png",
  "/photos/nsf/cabo-40-express.png",
  "/photos/nsf/yellowfin-marina-duo.png",
  "/photos/nsf/yellowfin-ocean-duo.png",
  "/photos/nsf/yellowfin-marina-catch.png",
  "/photos/nsf/rods-wake-sunset.png",
  "/photos/nsf/reel-sunset.png",
  "/photos/nsf/marina-sunset-lighthouse.png",
  "/photos/nsf/tuna-scales-detail.png",
  "/photos/stock/cabo/el-arco-sunset-jarvis.jpg",
  "/photos/stock/cabo/el-arco-from-boat-pexels.jpg",
  "/photos/stock/cabo/marina-yachts-pexels.jpg",
];

export function GalleryPreviewClient() {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const close = useCallback(() => setLightboxIndex(null), []);
  const prev = useCallback(() => {
    setLightboxIndex((i) => (i === null ? null : (i - 1 + GALLERY_IMAGES.length) % GALLERY_IMAGES.length));
  }, []);
  const next = useCallback(() => {
    setLightboxIndex((i) => (i === null ? null : (i + 1) % GALLERY_IMAGES.length));
  }, []);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, close, prev, next]);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
        {GALLERY_IMAGES.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => setLightboxIndex(i)}
            className="relative aspect-[4/3] overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
          >
            <Image
              src={src}
              alt={`Nasty Sport Fishing Cabo — gallery ${i + 1}`}
              fill
              className="object-cover transition-transform duration-300 hover:scale-105"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            />
          </button>
        ))}
      </div>

      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Gallery lightbox"
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="absolute left-2 sm:left-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Previous"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="absolute right-2 sm:right-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Next"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
          <div
            className="relative h-[70vh] w-full max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={GALLERY_IMAGES[lightboxIndex]}
              alt=""
              fill
              className="object-contain"
              sizes="90vw"
              priority
            />
          </div>
        </div>
      )}
    </>
  );
}
