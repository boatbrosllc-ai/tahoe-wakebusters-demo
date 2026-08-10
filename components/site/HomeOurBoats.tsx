"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { getDisplayImageUrl } from "@/lib/utils";
import { getDisplayDescription } from "@/lib/booking/boat-display";
import { ChevronRight } from "lucide-react";

export type HomeBoatItem = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  photos: string[];
  boatType?: string;
};

function shortDescription(description: string | undefined, max = 180): string {
  if (!description?.trim()) return "Cabo sport fishing boat. Captain and crew included.";
  const first = description.trim().split(/\n\n+/)[0];
  return first.length > max ? first.slice(0, max - 3) + "..." : first;
}

export function HomeOurBoats({ boats }: { boats: HomeBoatItem[] }) {
  const boat = boats[0];
  const imageUrl = boat?.photos[0]
    ? getDisplayImageUrl(boat.photos[0])
    : "/photos/nsf/cabo-40-express.png";
  const desc = boat ? shortDescription(getDisplayDescription(boat)) : null;

  return (
    <section className="section-padding bg-white" aria-labelledby="our-boat-heading">
      <div className="container-wide px-4 sm:px-6 lg:px-8">
        <motion.h2
          id="our-boat-heading"
          className="text-3xl sm:text-4xl lg:text-5xl font-bold text-brand-dark text-center mb-4 sm:mb-5"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4 }}
        >
          Our Boat
        </motion.h2>
        <motion.p
          className="text-lg sm:text-xl text-brand-muted text-center max-w-2xl mx-auto mb-10 sm:mb-12 leading-relaxed"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4, delay: 0.06 }}
        >
          {boat
            ? "One boat. Every Cabo charter includes a licensed captain and crew."
            : "Our Cabo sport fishing boat—captain and crew included on every charter."}
        </motion.p>

        {boat ? (
          <motion.div
            className="mx-auto max-w-4xl"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-30px" }}
            transition={{ duration: 0.45, delay: 0.1 }}
          >
            <Link
              href={`/boats/${boat.slug}`}
              className="group block relative overflow-hidden rounded-2xl bg-brand-dark ring-2 ring-brand-primary/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 transition-all duration-300 hover:shadow-lg hover:shadow-brand-primary/20 hover:ring-brand-primary"
              aria-label={`${boat.name} — view boat details`}
            >
              <div className="relative aspect-[16/10] min-h-[220px] sm:min-h-[280px] lg:min-h-[340px]">
                <Image
                  src={imageUrl}
                  alt={`${boat.name} — Cabo San Lucas sport fishing charter boat`}
                  fill
                  className="object-cover object-center transition-transform duration-500 group-hover:scale-[1.02]"
                  sizes="(max-width: 896px) 100vw, 896px"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 from-15% via-black/35 to-transparent" />
                <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-7 lg:p-8">
                  <h3 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-tight leading-snug">
                    {boat.name}
                  </h3>
                  <p className="mt-2 sm:mt-3 text-white/90 text-sm sm:text-base max-w-2xl leading-relaxed line-clamp-3">
                    {desc}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-white font-semibold text-sm sm:text-base group-hover:gap-2.5 transition-[gap] duration-200">
                    Meet the boat <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 group-hover:translate-x-0.5 transition-transform duration-200" aria-hidden />
                  </span>
                </div>
              </div>
            </Link>
            <motion.div
              className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.2 }}
            >
              <Link
                href={`/boats/${boat.slug}`}
                className="inline-flex items-center justify-center rounded-full h-12 px-8 bg-brand-primary text-brand-dark hover:bg-brand-primary/95 font-semibold shadow-lg shadow-brand-primary/25 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
              >
                Boat details
              </Link>
              <Link
                href="/experiences"
                className="inline-flex items-center justify-center rounded-full h-12 px-8 border-2 border-brand-dark/15 text-brand-dark hover:bg-brand-dark/5 font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
              >
                View charters
              </Link>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            className="text-center py-8"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
          >
            <p className="text-brand-muted mb-4">Our Cabo sport fishing boat—captain and crew included on every charter.</p>
            <Link
              href="/experiences"
              className="inline-flex items-center justify-center rounded-full h-12 px-8 bg-brand-primary text-brand-dark hover:bg-brand-primary/95 font-semibold shadow-lg shadow-brand-primary/25 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
            >
              View charters
            </Link>
          </motion.div>
        )}
      </div>
    </section>
  );
}
