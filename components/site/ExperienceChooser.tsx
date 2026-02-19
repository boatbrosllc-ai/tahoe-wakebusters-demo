"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { experiences, formatExperiencePriceLabel } from "@/content/experiences";
import type { Experience } from "@/content/experiences";
import { getDisplayImageUrl } from "@/lib/utils";
import { Clock, Users, ChevronRight } from "lucide-react";

export function ExperienceChooser() {
  const [listingBySlug, setListingBySlug] = useState<Record<string, { title?: string; subtitle?: string; heroMedia?: { url?: string } }>>({});
  useEffect(() => {
    fetch("/api/experiences")
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data?.experiences) ? data.experiences : [];
        const map: Record<string, { title?: string; subtitle?: string; heroMedia?: { url?: string } }> = {};
        list.forEach((item: { slug?: string; title?: string; subtitle?: string; heroMedia?: { url?: string } }) => {
          if (item.slug) map[item.slug] = { title: item.title, subtitle: item.subtitle, heroMedia: item.heroMedia };
        });
        setListingBySlug(map);
      })
      .catch(() => setListingBySlug({}));
  }, []);

  /** All boats are up to 14 people. */
  const CAPACITY_ALL = "Up to 14";

  const experienceWithListingData = (exp: Experience): Experience => {
    const listing = listingBySlug[exp.slug];
    return {
      ...exp,
      title: listing?.title?.trim() || exp.title,
      shortDescription: listing?.subtitle?.trim() || exp.shortDescription,
      heroImage: listing?.heroMedia?.url || exp.heroImage,
      capacity: CAPACITY_ALL,
    };
  };

  const pontoon = experiences.find((e) => e.slug === "pontoon");
  const rest = experiences.filter((e) => e.slug !== "pontoon");
  const pontoonData = pontoon ? experienceWithListingData(pontoon) : null;

  return (
    <section className="section-padding bg-white" aria-labelledby="experience-chooser-heading">
      <div className="container-wide px-4 sm:px-6 lg:px-8">
        <motion.h2
          id="experience-chooser-heading"
          className="text-3xl sm:text-4xl lg:text-5xl font-bold text-brand-dark text-center mb-4 sm:mb-5"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4 }}
        >
          Choose your experience
        </motion.h2>
        <motion.p
          className="text-lg sm:text-xl text-brand-muted text-center max-w-2xl mx-auto mb-4 leading-relaxed"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4, delay: 0.06 }}
        >
          Pick one and book now.
        </motion.p>
        <motion.p
          className="text-center mb-10 sm:mb-12"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4, delay: 0.08 }}
        >
          <Link
            href="/lake-austin-pontoon-rentals"
            className="text-brand-primary font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 rounded"
          >
            Lake Austin Pontoon Rentals
          </Link>
        </motion.p>

        {pontoonData && (
          <motion.div
            className="mb-6 sm:mb-8 relative"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45, delay: 0.1 }}
          >
            <Link
              href={`/experiences/${pontoonData.slug}`}
              className="group block relative rounded-2xl bg-brand-dark ring-4 ring-brand-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 transition-all duration-300 hover:shadow-2xl hover:shadow-brand-secondary/20 hover:-translate-y-1 hover:ring-brand-secondary/90"
              aria-label={`${pontoonData.title} — view details`}
            >
              {/* Most popular tag: overlapping top-right; scaled for mobile vs desktop */}
              <div
                className="absolute top-0 right-0 z-20 w-52 h-52 sm:w-72 sm:h-72 lg:w-96 lg:h-96 pointer-events-none translate-x-[30%] -translate-y-1/2 rotate-[16deg] transition-transform duration-500 ease-out group-hover:scale-105 group-hover:rotate-[20deg]"
                aria-hidden
              >
                <Image
                  src="/photos/most popular.png"
                  alt=""
                  fill
                  className="object-contain drop-shadow-xl transition-[filter] duration-500 group-hover:drop-shadow-2xl"
                  sizes="(max-width: 640px) 208px, (max-width: 1024px) 288px, 384px"
                />
              </div>
              <div className="relative overflow-hidden rounded-2xl aspect-[4/3] sm:aspect-[5/2] min-h-[280px] sm:min-h-[300px] lg:min-h-[320px]">
                <Image
                  src={getDisplayImageUrl(pontoonData.heroImage)}
                  alt=""
                  fill
                  className="object-cover object-[center_90%] sm:object-[center_75%] lg:object-[center_65%] transition-transform duration-500 group-hover:scale-[1.03]"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 1280px"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 from-18% via-black/40 to-transparent sm:from-black/88 sm:from-22%" />
                <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-7 lg:p-9">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-white mb-1.5">
                    <span className="inline-flex items-center gap-1.5 sm:gap-2">
                      <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" aria-hidden />
                      {pontoonData.duration}
                    </span>
                    <span className="inline-flex items-center gap-1.5 sm:gap-2">
                      <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" aria-hidden />
                      {pontoonData.capacity}
                    </span>
                  </div>
                  <h3 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-tight leading-snug">
                    {pontoonData.title}
                  </h3>
                  <p className="mt-2 sm:mt-3 text-white/90 text-sm sm:text-base max-w-lg line-clamp-3 leading-relaxed">
                    {pontoonData.shortDescription}
                  </p>
                  <div className="mt-4 sm:mt-5 flex flex-wrap items-center gap-2 sm:gap-4">
                    {pontoonData.fromPriceCents != null && (
                      <span className="text-base sm:text-xl font-bold text-brand-primary">{formatExperiencePriceLabel(pontoonData.slug, pontoonData.fromPriceCents)}</span>
                    )}
                    <span className="inline-flex items-center gap-1.5 text-white font-medium text-sm group-hover:gap-2.5 transition-[gap] duration-200">
                      View trip <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform duration-200" aria-hidden />
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-5">
          {rest.map((exp, i) => {
            const data = experienceWithListingData(exp);
            return (
              <motion.div
                key={data.slug}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ duration: 0.4, delay: 0.15 + i * 0.06 }}
              >
                <Link
                  href={`/experiences/${data.slug}`}
                  className="group block relative rounded-2xl bg-brand-dark ring-4 ring-brand-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 transition-all duration-300 hover:shadow-2xl hover:shadow-brand-primary/25 hover:-translate-y-1 hover:ring-brand-primary/90"
                  aria-label={`${data.title} — view details`}
                >
                <div className="relative overflow-hidden rounded-2xl aspect-[4/3] min-h-[200px] sm:min-h-[220px]">
                  <Image
                    src={getDisplayImageUrl(data.heroImage)}
                    alt=""
                    fill
                    className="object-cover object-[center_90%] transition-transform duration-500 group-hover:scale-[1.03]"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 from-18% via-black/40 to-transparent sm:from-black/88 sm:from-22%" />
                  <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-6 lg:p-7">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-white mb-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {data.duration}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {data.capacity}
                      </span>
                    </div>
                    <h3 className="font-display text-sm sm:text-base lg:text-lg font-bold text-white tracking-tight leading-snug">
                      {data.title}
                    </h3>
                    <p className="mt-2 text-white/90 text-xs sm:text-sm line-clamp-3 leading-relaxed">
                      {data.shortDescription}
                    </p>
                    <div className="mt-3 sm:mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
                      {data.fromPriceCents != null && (
                        <span className="text-sm sm:text-base font-bold text-brand-primary">{formatExperiencePriceLabel(data.slug, data.fromPriceCents)}</span>
                      )}
                      <span className="inline-flex items-center gap-1.5 text-white font-medium text-xs sm:text-sm group-hover:gap-2.5 transition-[gap] duration-200">
                        View trip <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 group-hover:translate-x-0.5 transition-transform duration-200" aria-hidden />
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
