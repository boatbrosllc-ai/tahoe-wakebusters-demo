"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { brand } from "@/content/brand";
import { fishProcessingConfig } from "@/content/seo/fish-processing";

export function CatchLabelMockup() {
  const label = fishProcessingConfig.labelMockup;

  return (
    <section
      className="section-padding bg-[#070f1a]"
      aria-labelledby="your-fish-heading"
    >
      <div className="container-wide mx-auto px-5 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div>
            <h2
              id="your-fish-heading"
              className="font-display font-extrabold text-white text-3xl sm:text-4xl lg:text-5xl tracking-tight"
            >
              YOUR FISH. NOT &ldquo;SOME FISH.&rdquo;
            </h2>
            <p className="mt-5 text-white/70 text-base sm:text-lg leading-relaxed">
              There&apos;s something different about opening your freezer and eating the fish you
              fought for in Cabo.
            </p>
            <p className="mt-4 text-white/70 text-base sm:text-lg leading-relaxed">
              {brand.shortName} keeps your catch organized through processing, professionally packs it and gets
              it ready for the trip home.
            </p>
            <p className="mt-8 font-display font-extrabold text-brand-secondary text-xl sm:text-2xl tracking-wide">
              YOU FOUGHT FOR IT. YOU SHOULD BE THE ONE EATING IT.
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45 }}
            className="relative"
          >
            <div className="absolute -inset-4 bg-brand-primary/10 blur-2xl rounded-full" aria-hidden />
            <div className="relative rounded-lg border border-white/20 bg-gradient-to-br from-[#121c2c] to-[#0a1018] p-5 sm:p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <p className="font-display font-extrabold text-white tracking-wide text-sm sm:text-base">
                    {label.brand}
                  </p>
                  <p className="text-[11px] tracking-[0.2em] text-brand-primary font-bold mt-1">
                    {label.location}
                  </p>
                </div>
                <div className="relative h-10 w-10 opacity-90">
                  <Image
                    src={brand.logoPath}
                    alt=""
                    fill
                    className="object-contain"
                    sizes="40px"
                    unoptimized
                  />
                </div>
              </div>

              <div className="border border-dashed border-white/25 rounded-md p-4 sm:p-5 bg-black/30">
                <p className="font-display font-extrabold text-brand-secondary text-xl sm:text-2xl tracking-wide mb-4">
                  {label.species}
                </p>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-white/40 text-xs uppercase tracking-wider">Caught by</dt>
                    <dd className="text-white font-medium">{label.caughtBy}</dd>
                  </div>
                  <div>
                    <dt className="text-white/40 text-xs uppercase tracking-wider">Date</dt>
                    <dd className="text-white font-medium">{label.date}</dd>
                  </div>
                  <div>
                    <dt className="text-white/40 text-xs uppercase tracking-wider">Boat</dt>
                    <dd className="text-white font-medium">{label.boat}</dd>
                  </div>
                  <div>
                    <dt className="text-white/40 text-xs uppercase tracking-wider">Package weight</dt>
                    <dd className="text-white font-medium">{label.packageWeight}</dd>
                  </div>
                </dl>
              </div>

              <p className="mt-5 font-display font-bold text-white/90 text-sm sm:text-base tracking-wide">
                YOUR CABO STORY, STILL IN THE FREEZER MONTHS LATER.
              </p>
              <p className="mt-2 text-[11px] text-white/40">{label.disclaimer}</p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
