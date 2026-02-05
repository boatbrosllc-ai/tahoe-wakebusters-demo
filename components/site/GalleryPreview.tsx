"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";

const images = [
  "/photos/DSC00427.webp",
  "/photos/DSC09255.webp",
  "/photos/DSC00539.webp",
  "/photos/DSC09354.webp",
];

export function GalleryPreview() {
  return (
    <section className="section-padding bg-brand-bg" aria-labelledby="gallery-heading">
      <div className="container-wide">
        <h2 id="gallery-heading" className="text-2xl sm:text-3xl lg:text-4xl font-bold text-brand-dark text-center mb-4">
          On the water
        </h2>
        <p className="text-base sm:text-lg text-brand-muted text-center max-w-2xl mx-auto mb-8 sm:mb-10">
          Lake Travis & Lake Austin views, boats, and good times.
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {images.map((src, i) => (
            <motion.div
              key={src}
              initial={{ opacity: 0, scale: 0.98 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.05 }}
              className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-brand-dark/10 shadow-soft ring-1 ring-brand-dark/5"
            >
              <Image
                src={src}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 50vw, 25vw"
              />
            </motion.div>
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
    </section>
  );
}
