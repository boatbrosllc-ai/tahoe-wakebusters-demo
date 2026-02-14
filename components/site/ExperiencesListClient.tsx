"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { experiences } from "@/content/experiences";
import type { Experience } from "@/content/experiences";
import { Button } from "@/components/ui/button";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { getDisplayImageUrl } from "@/lib/utils";
import { Clock, Users, ChevronRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

type ListingData = { title?: string; subtitle?: string; heroUrl?: string };

export function ExperiencesListClient() {
  const [order, setOrder] = useState<string[] | null>(null);
  const [listingBySlug, setListingBySlug] = useState<Record<string, ListingData>>({});
  const { setOpen: setBookingModalOpen } = useBookingModal();

  useEffect(() => {
    fetch("/api/experiences/order")
      .then((res) => res.json())
      .then((data) => setOrder(Array.isArray(data.order) ? data.order : []))
      .catch(() => setOrder([]));
  }, []);

  useEffect(() => {
    fetch("/api/experiences")
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data?.experiences) ? data.experiences : [];
        const map: Record<string, ListingData> = {};
        list.forEach((item: { slug?: string; title?: string; subtitle?: string; heroMedia?: { url?: string } }) => {
          if (item.slug) {
            map[item.slug] = {
              title: item.title,
              subtitle: item.subtitle,
              heroUrl: item.heroMedia?.url,
            };
          }
        });
        setListingBySlug(map);
      })
      .catch(() => setListingBySlug({}));
  }, []);

  const sortedExperiences = useMemo(() => {
    if (!order || order.length === 0) return experiences;
    return [...experiences].sort((a, b) => {
      const i = order.indexOf(a.slug);
      const j = order.indexOf(b.slug);
      if (i === -1 && j === -1) return a.title.localeCompare(b.title);
      if (i === -1) return 1;
      if (j === -1) return -1;
      return i - j;
    });
  }, [order]);

  const experienceWithListingData = (exp: Experience): Experience => {
    const listing = listingBySlug[exp.slug];
    if (!listing) return exp;
    return {
      ...exp,
      title: listing.title?.trim() || exp.title,
      shortDescription: listing.subtitle?.trim() || exp.shortDescription,
      heroImage: listing.heroUrl || exp.heroImage,
    };
  };

  const pontoonExperience = sortedExperiences.find((e) => e.slug === "pontoon");
  const rest = sortedExperiences.filter((e) => e.slug !== "pontoon");
  const firstData = pontoonExperience ? experienceWithListingData(pontoonExperience) : null;

  const contentWidth = "max-w-5xl mx-auto px-6 sm:px-8 lg:px-10";
  const reduceMotion = useReducedMotion();
  const easing = [0.22, 1, 0.36, 1];
  const sectionReveal = reduceMotion ? {} : { initial: { opacity: 0, y: 28 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: 0.55, ease: easing } };
  const staggerContainer = reduceMotion ? {} : { initial: "hidden", whileInView: "visible", viewport: { once: true, margin: "-40px" }, variants: { hidden: {}, visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } } };
  const staggerItem = reduceMotion ? {} : { variants: { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }, transition: { duration: 0.4, ease: easing } };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero – gradient + motion */}
      <section className="relative h-[45vh] min-h-[320px] max-h-[480px] overflow-hidden bg-brand-dark">
        <div className="absolute inset-0 sm:hidden">
          <Image src="/photos/IMG_0386.webp" alt="" fill className="object-cover object-[center_62%]" priority sizes="100vw" />
        </div>
        <div className="absolute inset-0 hidden sm:block">
          <Image src="/photos/IMG_2123.webp" alt="" fill className="object-cover object-[center_78%]" priority sizes="100vw" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 from-30% via-black/25 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-center items-center sm:justify-end sm:items-stretch pb-0 sm:pb-12 sm:pb-16 lg:pb-20">
          <div className={contentWidth + " relative text-center sm:text-left w-full"}>
            <motion.h1
              className="font-display text-4xl sm:text-5xl md:text-6xl font-bold text-white tracking-tight leading-tight"
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              animate={reduceMotion ? {} : { opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: easing }}
            >
              On the water
            </motion.h1>
            <motion.p
              className="mt-4 text-lg text-white/90 max-w-lg sm:max-w-lg mx-auto sm:mx-0"
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={reduceMotion ? {} : { opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1, ease: easing }}
            >
              Lake Austin boat rentals: pontoon, wake surf, sunset cruises — book your day on the water.
            </motion.p>
          </div>
        </div>
      </section>

      {/* Choose your experience – same layout as homepage */}
      <section className="section-padding bg-white" aria-labelledby="experiences-chooser-heading">
        <div className="container-wide px-4 sm:px-6 lg:px-8">
          <motion.h2
            id="experiences-chooser-heading"
            className="text-3xl sm:text-4xl lg:text-5xl font-bold text-brand-dark text-center mb-4 sm:mb-5"
            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
            whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4 }}
          >
            Choose your experience
          </motion.h2>
          <motion.p
            className="text-lg sm:text-xl text-brand-muted text-center max-w-2xl mx-auto mb-10 sm:mb-12 leading-relaxed"
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4, delay: 0.06 }}
          >
            Pick one and book now.
          </motion.p>

          {firstData && (
            <motion.div
              className="mb-6 sm:mb-8 relative"
              initial={reduceMotion ? false : { opacity: 0, y: 24 }}
              whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: 0.1 }}
            >
              <Link
                href={`/experiences/${firstData.slug}`}
                className="group block relative rounded-2xl bg-brand-dark ring-4 ring-brand-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 transition-all duration-300 hover:shadow-2xl hover:shadow-brand-secondary/20 hover:-translate-y-1 hover:ring-brand-secondary/90"
                aria-label={`${firstData.title} — view details`}
              >
                {firstData.slug === "pontoon" && (
                  <div
                    className="absolute top-0 right-0 z-10 w-52 h-52 sm:w-72 sm:h-72 lg:w-96 lg:h-96 pointer-events-none translate-x-[30%] -translate-y-1/2 rotate-[16deg] transition-transform duration-500 ease-out group-hover:scale-105 group-hover:rotate-[20deg]"
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
                )}
                <div className="relative overflow-hidden rounded-2xl aspect-[4/3] sm:aspect-[5/2] min-h-[280px] sm:min-h-[300px] lg:min-h-[320px]">
                  <Image
                    src={getDisplayImageUrl(firstData.heroImage)}
                    alt=""
                    fill
                    className={`object-cover transition-transform duration-500 group-hover:scale-[1.03] ${firstData.slug === "pontoon" ? "object-[center_90%] sm:object-[center_75%] lg:object-[center_65%]" : firstData.slug === "sunset" ? "object-[center_60%]" : "object-center"}`}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 1280px"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 from-35% via-black/20 to-transparent sm:from-black/80 sm:from-40%" />
                  <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-6 lg:p-8">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-brand-primary/95 mb-1">
                      <span className="inline-flex items-center gap-1.5 sm:gap-2">
                        <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" aria-hidden />
                        {firstData.duration}
                      </span>
                      <span className="inline-flex items-center gap-1.5 sm:gap-2">
                        <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" aria-hidden />
                        {firstData.capacity}
                      </span>
                    </div>
                    <h3 className="font-display text-xl sm:text-3xl lg:text-4xl font-bold text-white tracking-tight leading-tight">
                      {firstData.title}
                    </h3>
                    <p className="mt-1 sm:mt-2 text-white/90 text-sm sm:text-base max-w-lg line-clamp-2">
                      {firstData.shortDescription}
                    </p>
                    <div className="mt-3 sm:mt-4 flex flex-wrap items-center gap-2 sm:gap-4">
                      {firstData.fromPriceCents != null && (
                        <span className="text-base sm:text-xl font-bold text-brand-primary">From ${(firstData.fromPriceCents / 100).toFixed(0)}</span>
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
                  initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                  whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
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
                        className={`object-cover object-[center_90%] transition-transform duration-500 group-hover:scale-[1.03] ${data.slug === "sunset" ? "object-[center_65%]" : ""}`}
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 from-35% via-black/20 to-transparent sm:from-black/80 sm:from-40%" />
                      <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-5 lg:p-6">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-brand-primary/95 mb-1">
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {data.duration}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {data.capacity}
                          </span>
                        </div>
                        <h3 className="font-display text-lg sm:text-xl lg:text-2xl font-bold text-white tracking-tight leading-tight">
                          {data.title}
                        </h3>
                        <p className="mt-1 text-white/90 text-xs sm:text-sm line-clamp-2">
                          {data.shortDescription}
                        </p>
                        <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
                          {data.fromPriceCents != null && (
                            <span className="text-sm sm:text-base font-bold text-brand-primary">From ${(data.fromPriceCents / 100).toFixed(0)}</span>
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

      {/* CTA – motion + color + hover */}
      <motion.section className="py-16 sm:py-20 lg:py-24 bg-gradient-to-b from-brand-bg to-white" {...sectionReveal}>
        <div className={contentWidth + " text-center"}>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-brand-dark tracking-tight">See you on the water</h2>
          <p className="mt-4 text-brand-muted text-base max-w-md mx-auto">Find your day or reach out — we&apos;re here to help.</p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="rounded-full h-12 px-8 bg-brand-primary text-brand-dark hover:bg-brand-primary/95 font-semibold shadow-lg shadow-brand-primary/25 hover:shadow-xl hover:shadow-brand-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
              onClick={() => setBookingModalOpen(true)}
            >
              Reserve your spot
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-full h-12 px-8 border-2 border-brand-dark/20 text-brand-dark hover:bg-brand-dark/5 hover:border-brand-dark/30 transition-all duration-200">
              <Link href="/contact">Contact us</Link>
            </Button>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
