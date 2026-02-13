"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const images = [
  "/photos/IMG_8520.webp",
  "/photos/DSC00484.webp",
  "/photos/DSC09399%20(2).webp",
  "/photos/DSC09308%20(2).webp",
  "/photos/DSC09319%20(4).webp",
  "/photos/IMG_9649.webp",
  "/photos/DSC00539.webp",
  "/photos/IMG_5095.webp",
  "/photos/IMG_5285.webp",
];

export function GalleryPreview() {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  return (
    <section className="section-padding bg-brand-bg" aria-labelledby="gallery-heading">
      <div className="container-wide">
        <h2 id="gallery-heading" className="text-2xl sm:text-3xl lg:text-4xl font-bold text-brand-dark text-center mb-4">
          On the water
        </h2>
        <p className="text-base sm:text-lg text-brand-muted text-center max-w-2xl mx-auto mb-8 sm:mb-10">
          Lake Austin views, boats, and good times.
        </p>
        <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:gap-4">
          {images.map((src, i) => (
            <motion.button
              type="button"
              key={src}
              initial={{ opacity: 0, scale: 0.98 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.04 }}
              whileHover={{ scale: 1.05, transition: { duration: 0.2 } }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setLightboxSrc(src)}
              className={cn(
                "relative aspect-[4/3] rounded-xl sm:rounded-2xl overflow-hidden bg-brand-dark/10 shadow-soft ring-1 ring-brand-dark/5",
                "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg"
              )}
              aria-label="View photo"
            >
              <Image
                src={src}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 640px) 33vw, (max-width: 1024px) 33vw, 20vw"
              />
            </motion.button>
          ))}
        </div>
        <p className="mt-6 sm:mt-6 text-center">
          <Link
            href="/experiences"
            className="text-brand-primary font-medium hover:text-brand-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded-lg"
          >
            See all experiences →
          </Link>
        </p>
      </div>

      {/* Lightbox – scale-in on click */}
      <AnimatePresence>
        {lightboxSrc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
            onClick={() => setLightboxSrc(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Photo view"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative max-w-5xl max-h-[85vh] w-full aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/20"
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={lightboxSrc}
                alt=""
                fill
                className="object-contain"
                sizes="90vw"
                priority
              />
            </motion.div>
            <button
              type="button"
              onClick={() => setLightboxSrc(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="Close"
            >
              <X className="h-6 w-6" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
