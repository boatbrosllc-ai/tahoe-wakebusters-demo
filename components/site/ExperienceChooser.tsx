"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { experiences, formatExperiencePriceLabel } from "@/content/experiences";
import type { Experience } from "@/content/experiences";
import { getDisplayImageUrl } from "@/lib/utils";
import { Clock, Users, ChevronRight } from "lucide-react";
import * as bookingCache from "@/lib/booking/booking-data-cache";
import { experienceCardImageUrl } from "@/lib/booking/experience-card-image";
import { EXPERIENCE_ALIAS_FAMILIES, isWatersportsSlug } from "@/lib/booking/experience-aliases";

export function ExperienceChooser() {
  const [listings, setListings] = useState<
    Array<{
      slug: string;
      title?: string;
      subtitle?: string;
      heroMedia?: { type?: "image" | "video"; url?: string };
      gallery?: string[];
      fromPriceCents?: number | null;
      pricingType?: "charter" | "ticketed";
    }>
  >([]);
  const [apiError, setApiError] = useState(false);
  const staticBySlug = new Map(experiences.map((exp) => [exp.slug, exp]));
  const adminManagedStaticSlugs = new Set(["pontoon", "watersports", "sunset", "holiday"]);
  useEffect(() => {
    bookingCache
      .fetchExperiences()
      .then((data) => {
        setApiError(false);
        const list = Array.isArray(data?.experiences) ? data.experiences : [];
        const next: Array<{
          slug: string;
          title?: string;
          subtitle?: string;
          heroMedia?: { type?: "image" | "video"; url?: string };
          gallery?: string[];
          fromPriceCents?: number | null;
          pricingType?: "charter" | "ticketed";
        }> = [];
        list.forEach((item: {
          slug?: string;
          title?: string;
          subtitle?: string;
          heroMedia?: { type?: "image" | "video"; url?: string };
          gallery?: string[];
          fromPriceCents?: number | null;
          pricingType?: "charter" | "ticketed";
        }) => {
          if (item.slug)
            next.push({
              slug: item.slug,
              title: item.title,
              subtitle: item.subtitle,
              heroMedia: item.heroMedia,
              gallery: Array.isArray(item.gallery) ? item.gallery : [],
              fromPriceCents: item.fromPriceCents,
              pricingType: item.pricingType,
            });
        });
        setListings(next);
      })
      .catch(() => {
        setApiError(true);
        setListings([]);
      });
  }, []);

  /** All boats are up to 14 people. */
  const CAPACITY_ALL = "Up to 14";

  const experienceWithListingData = (listing: {
    slug: string;
    title?: string;
    subtitle?: string;
    heroMedia?: { type?: "image" | "video"; url?: string };
    gallery?: string[];
    fromPriceCents?: number | null;
    pricingType?: "charter" | "ticketed";
  }): Experience & { fromPriceCents?: number | null; pricingType?: "charter" | "ticketed" } => {
    const exp = staticBySlug.get(listing.slug);
    const fromListing = experienceCardImageUrl(listing.heroMedia, listing.gallery);
    return {
      slug: listing.slug,
      title: listing.title?.trim() || exp?.title || "Experience",
      shortDescription: listing.subtitle?.trim() || exp?.shortDescription || "",
      description: exp?.description || "",
      highlights: exp?.highlights || [],
      duration: exp?.duration || "See details",
      durationMinutes: exp?.durationMinutes,
      capacity: CAPACITY_ALL,
      heroImage: fromListing ?? exp?.heroImage ?? "/photos/IMG_0386.webp",
      gallery: exp?.gallery || [],
      pricingNote: exp?.pricingNote || "",
      fromPriceCents: listing.fromPriceCents !== undefined ? listing.fromPriceCents : exp?.fromPriceCents,
      ...(listing.pricingType && { pricingType: listing.pricingType }),
    };
  };

  const activeManagedSlugs = new Set(listings.map((item) => item.slug));
  const staticFallback = listings.length === 0
    ? experiences.filter((exp) => !adminManagedStaticSlugs.has(exp.slug)).map((exp) => ({
      slug: exp.slug,
      title: exp.title,
      subtitle: exp.shortDescription,
      heroMedia: { type: "image" as const, url: exp.heroImage },
      gallery: exp.gallery ?? [],
      fromPriceCents: exp.fromPriceCents ?? null,
      pricingType: undefined,
    }))
    : [];
  const cards = [...listings, ...staticFallback]
    .filter((item) => !adminManagedStaticSlugs.has(item.slug) || activeManagedSlugs.has(item.slug))
    .map(experienceWithListingData);

  type Card = (typeof cards)[number];

  const normSlug = (s: string) => s.trim().toLowerCase();
  const watersportsFamily = EXPERIENCE_ALIAS_FAMILIES.find((f) => f[0] === "watersports") ?? ["watersports"];
  const wakeFamilySlugsOrdered: string[] = [];
  const wakeOrderSeen = new Set<string>();
  for (const s of watersportsFamily) {
    const n = normSlug(s);
    if (n === "watersports") continue;
    if (wakeOrderSeen.has(n)) continue;
    wakeOrderSeen.add(n);
    wakeFamilySlugsOrdered.push(n);
  }

  const MID_ROW_RESERVED = new Set(["pontoon", "sunset", "holiday", "watersports"].map(normSlug));
  /** Slug/title hints for a second wake listing (slug not yet in alias family — common in CMS). */
  const slugLooksWakeSurfClub = (slug: string): boolean => {
    const s = normSlug(slug);
    if (MID_ROW_RESERVED.has(s)) return false;
    if (/wake.*surf|surf.*wake|wakesurf|surf-club|wake-club|wake_surf/.test(s)) return true;
    return false;
  };
  const titleLooksWakeSurfClub = (title: string): boolean => {
    const t = title.trim().toLowerCase();
    if (/\bwake\s*surf\s*club\b/.test(t)) return true;
    if (/\bwake\s*surf\b/.test(t) && /\bclub\b/.test(t)) return true;
    if (/\bwake\s*club\b/.test(t) && /surf/.test(t)) return true;
    return false;
  };

  /** Wake Surf Club row tile: known wake aliases first, then any other wake-family slug, then slug/title heuristics (keeps it out of `rest`). */
  const pickMidRowWakeClubCard = (list: Card[]): Card | null => {
    for (const slug of wakeFamilySlugsOrdered) {
      const c = list.find((e) => normSlug(e.slug) === slug);
      if (c) return c;
    }
    const familyExtra = list.find(
      (e) => !MID_ROW_RESERVED.has(normSlug(e.slug)) && isWatersportsSlug(e.slug)
    );
    if (familyExtra) return familyExtra;
    const bySlugHeuristic = list.find((e) => slugLooksWakeSurfClub(e.slug));
    if (bySlugHeuristic) return bySlugHeuristic;
    return (
      list.find(
        (e) => !MID_ROW_RESERVED.has(normSlug(e.slug)) && titleLooksWakeSurfClub(e.title ?? "")
      ) ?? null
    );
  };

  /** Homepage: large pontoon first; one row of three (sunset, holiday, wake surf club listing); then large watersports hero. */
  const pontoonData = cards.find((e) => normSlug(e.slug) === "pontoon") ?? null;
  const sunsetCard = cards.find((e) => normSlug(e.slug) === "sunset") ?? null;
  const holidayCard = cards.find((e) => normSlug(e.slug) === "holiday") ?? null;
  const watersportsFeatured = cards.find((e) => normSlug(e.slug) === "watersports") ?? null;
  const wakeSurfClubCard = pickMidRowWakeClubCard(cards);
  const midRowCards = [sunsetCard, holidayCard, wakeSurfClubCard].filter((e): e is Card => e != null);

  /** Canonical `watersports` is the big hero; mid-row wake club + other wake aliases never repeat in the grid below. */
  const usedSlugs = new Set<string>(["pontoon", "sunset", "holiday", "watersports"]);
  for (const e of cards) {
    if (normSlug(e.slug) === "watersports") continue;
    if (isWatersportsSlug(e.slug)) usedSlugs.add(e.slug);
  }
  if (wakeSurfClubCard) usedSlugs.add(wakeSurfClubCard.slug);
  const rest = cards.filter((e) => !usedSlugs.has(e.slug));

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
          className="text-lg sm:text-xl text-brand-muted text-center max-w-2xl mx-auto mb-10 sm:mb-12 leading-relaxed"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4, delay: 0.06 }}
        >
          {apiError && (
            <span className="block text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 text-center" role="status">
              Prices may not be up to date — refresh to see the latest.
            </span>
          )}
          Pick one and book now.
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
                    <span className="text-base sm:text-xl font-bold text-brand-primary">
                      {formatExperiencePriceLabel(
                        pontoonData.slug,
                        pontoonData.fromPriceCents ?? null,
                        (pontoonData as { pricingType?: "charter" | "ticketed" }).pricingType
                      )}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-white font-medium text-sm group-hover:gap-2.5 transition-[gap] duration-200">
                      View trip <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform duration-200" aria-hidden />
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        )}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-4 lg:gap-5 mb-6 sm:mb-8">
          {midRowCards.map((data, i) => (
            <motion.div
              key={data.slug}
              className="min-w-0 w-full sm:flex-1"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ duration: 0.4, delay: 0.1 + i * 0.06 }}
            >
              <Link
                href={`/experiences/${data.slug}`}
                className="group block relative h-full rounded-2xl bg-brand-dark ring-4 ring-brand-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 transition-all duration-300 hover:shadow-2xl hover:shadow-brand-primary/25 hover:-translate-y-1 hover:ring-brand-primary/90"
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
                        <span className="text-sm sm:text-base font-bold text-brand-primary">
                          {formatExperiencePriceLabel(
                            data.slug,
                            data.fromPriceCents ?? null,
                            (data as { pricingType?: "charter" | "ticketed" }).pricingType
                          )}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-white font-medium text-xs sm:text-sm group-hover:gap-2.5 transition-[gap] duration-200">
                          View trip{" "}
                          <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4 group-hover:translate-x-0.5 transition-transform duration-200" aria-hidden />
                        </span>
                      </div>
                    </div>
                  </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {watersportsFeatured && (
          <motion.div
            className="mb-6 sm:mb-8 relative"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.45, delay: 0.12 }}
          >
            <Link
              href={`/experiences/${watersportsFeatured.slug}`}
              className="group block relative rounded-2xl bg-brand-dark ring-4 ring-brand-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 transition-all duration-300 hover:shadow-2xl hover:shadow-brand-primary/25 hover:-translate-y-1 hover:ring-brand-primary/90"
              aria-label={`${watersportsFeatured.title} — view details`}
            >
              <div className="relative overflow-hidden rounded-2xl aspect-[4/3] sm:aspect-[5/2] min-h-[280px] sm:min-h-[300px] lg:min-h-[320px]">
                <Image
                  src={getDisplayImageUrl(watersportsFeatured.heroImage)}
                  alt=""
                  fill
                  className="object-cover object-[center_22%] sm:object-[center_18%] lg:object-[center_14%] transition-transform duration-500 group-hover:scale-[1.03]"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 100vw, 1280px"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 from-18% via-black/40 to-transparent sm:from-black/88 sm:from-22%" />
                <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-7 lg:p-9">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-white mb-1.5">
                    <span className="inline-flex items-center gap-1.5 sm:gap-2">
                      <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" aria-hidden />
                      {watersportsFeatured.duration}
                    </span>
                    <span className="inline-flex items-center gap-1.5 sm:gap-2">
                      <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" aria-hidden />
                      {watersportsFeatured.capacity}
                    </span>
                  </div>
                  <h3 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-tight leading-snug">
                    {watersportsFeatured.title}
                  </h3>
                  <p className="mt-2 sm:mt-3 text-white/90 text-sm sm:text-base max-w-lg line-clamp-3 leading-relaxed">
                    {watersportsFeatured.shortDescription}
                  </p>
                  <div className="mt-4 sm:mt-5 flex flex-wrap items-center gap-2 sm:gap-4">
                    <span className="text-base sm:text-xl font-bold text-brand-primary">
                      {formatExperiencePriceLabel(
                        watersportsFeatured.slug,
                        watersportsFeatured.fromPriceCents ?? null,
                        (watersportsFeatured as { pricingType?: "charter" | "ticketed" }).pricingType
                      )}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-white font-medium text-sm group-hover:gap-2.5 transition-[gap] duration-200">
                      View trip <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform duration-200" aria-hidden />
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        )}

        {rest.length > 0 && (
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
                      <span className="text-sm sm:text-base font-bold text-brand-primary">
                        {formatExperiencePriceLabel(data.slug, data.fromPriceCents ?? null, (data as { pricingType?: "charter" | "ticketed" }).pricingType)}
                      </span>
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
        )}
      </div>
    </section>
  );
}
