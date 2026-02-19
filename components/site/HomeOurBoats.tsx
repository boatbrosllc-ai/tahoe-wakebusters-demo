"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { getDisplayImageUrl } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

export type HomeBoatItem = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  photos: string[];
  boatType?: string;
};

function shortDescription(description: string | undefined): string {
  if (!description?.trim()) return "Part of our Lake Austin fleet. Captain included.";
  const first = description.trim().split(/\n\n+/)[0];
  return first.length > 120 ? first.slice(0, 117) + "..." : first;
}

export function HomeOurBoats({ boats }: { boats: HomeBoatItem[] }) {
  return (
    <section className="section-padding bg-white" aria-labelledby="our-boats-heading">
      <div className="container-wide px-4 sm:px-6 lg:px-8">
        <motion.h2
          id="our-boats-heading"
          className="text-3xl sm:text-4xl lg:text-5xl font-bold text-brand-dark text-center mb-4 sm:mb-5"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4 }}
        >
          Our Boats
        </motion.h2>
        <motion.p
          className="text-lg sm:text-xl text-brand-muted text-center max-w-2xl mx-auto mb-10 sm:mb-12 leading-relaxed"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4, delay: 0.06 }}
        >
          Meet the fleet—every Lake Austin boat rental includes a licensed captain. Choose your experience, then pick your boat when you book.
        </motion.p>

        {boats.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 lg:gap-6">
              {boats.slice(0, 6).map((boat, i) => {
                const imageUrl = boat.photos[0] ? getDisplayImageUrl(boat.photos[0]) : "/photos/IMG_3160.webp";
                const desc = shortDescription(boat.description);
                return (
                  <motion.div
                    key={boat.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-30px" }}
                    transition={{ duration: 0.4, delay: 0.1 + i * 0.06 }}
                  >
                    <Link
                      href={`/boats/${boat.slug}`}
                      className="group block relative rounded-xl bg-brand-dark ring-2 ring-brand-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 transition-all duration-300 hover:shadow-lg hover:shadow-brand-primary/20 hover:-translate-y-0.5 hover:ring-brand-primary"
                      aria-label={`${boat.name} — view boat details`}
                    >
                      <div className="relative overflow-hidden rounded-xl aspect-[16/10] min-h-[160px] sm:min-h-[180px]">
                        <Image
                          src={imageUrl}
                          alt=""
                          fill
                          className="object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]"
                          sizes="(max-width: 640px) 100vw, 50vw"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 from-20% via-black/40 to-transparent" />
                        <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-5">
                          {boat.boatType && (
                            <span className="text-[11px] text-white/80 uppercase tracking-wide mb-0.5" aria-hidden>
                              {boat.boatType}
                            </span>
                          )}
                          <h3 className="font-display text-base sm:text-lg font-bold text-white tracking-tight leading-snug">
                            {boat.name}
                          </h3>
                          <p className="mt-1.5 text-white/90 text-xs sm:text-sm line-clamp-2 leading-snug">
                            {desc}
                          </p>
                          <span className="mt-2 sm:mt-2.5 inline-flex items-center gap-1.5 text-white font-medium text-xs sm:text-sm group-hover:gap-2 transition-[gap] duration-200">
                            View boat <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 group-hover:translate-x-0.5 transition-transform duration-200" aria-hidden />
                          </span>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
            <motion.p
              className="text-center mt-8 sm:mt-10"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <Link
                href="/boats"
                className="inline-flex items-center gap-1.5 text-brand-primary font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded"
              >
                View all boats <ChevronRight className="h-4 w-4" aria-hidden />
              </Link>
            </motion.p>
          </>
        ) : (
          <motion.div
            className="text-center py-8"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
          >
            <p className="text-brand-muted mb-4">Our fleet of Lake Austin rental boats—captain included on every trip.</p>
            <Link
              href="/boats"
              className="inline-flex items-center justify-center rounded-full h-12 px-8 bg-brand-primary text-brand-dark hover:bg-brand-primary/95 font-semibold shadow-lg shadow-brand-primary/25 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
            >
              Our Boats
            </Link>
          </motion.div>
        )}
      </div>
    </section>
  );
}
