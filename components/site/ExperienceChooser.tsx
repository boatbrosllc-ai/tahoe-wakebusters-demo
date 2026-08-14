"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { experiences, formatExperiencePriceLabel } from "@/content/experiences";
import type { Experience } from "@/content/experiences";
import { cn, getDisplayImageUrl } from "@/lib/utils";
import { Clock, Users, ChevronRight } from "lucide-react";
import * as bookingCache from "@/lib/booking/booking-data-cache";
import { experienceCardImageUrl } from "@/lib/booking/experience-card-image";
import { isWakeSurfClubSlug, isWatersportsSlug, isPontoonSlug, getCanonicalExperiencePath } from "@/lib/booking/experience-aliases";

const FALLBACK_CARD_IMAGE = "/photos/nsf/cabo-40-express.png";

/** Old Boat Bros / Lake Austin media still in Firestore — never show on NSF cards. */
function isLegacyExperienceImage(url: string | null | undefined): boolean {
  if (!url?.trim()) return true;
  return /boat-bros|firebasestorage\.app\/experi|IMG_\d|DSC0|pontoon-hero|lake.?austin/i.test(url);
}

function resolveCardHeroImage(
  listingHero: string | null,
  staticHero: string | undefined,
): string {
  if (listingHero && !isLegacyExperienceImage(listingHero)) return listingHero;
  return staticHero ?? FALLBACK_CARD_IMAGE;
}

function isLegacyListingCopy(text: string | null | undefined): boolean {
  return /lake\s*austin|boat\s*bros|pontoon charter|watersports charter|holiday boat tour/i.test(text ?? "");
}

export type ExperienceListingPayload = {
  slug: string;
  title?: string;
  subtitle?: string;
  heroMedia?: { type?: "image" | "video"; url?: string };
  gallery?: string[];
  fromPriceCents?: number | null;
  pricingType?: "charter" | "ticketed";
  listingCardImagePosition?: string;
};

interface ExperienceChooserProps {
  initialListings?: ExperienceListingPayload[];
}

export function ExperienceChooser({ initialListings = [] }: ExperienceChooserProps) {
  const [listings, setListings] = useState<ExperienceListingPayload[]>(initialListings);
  const [apiError, setApiError] = useState(false);
  const staticBySlug = new Map(experiences.map((exp) => [exp.slug, exp]));
  const adminManagedStaticSlugs = new Set(["pontoon", "watersports", "sunset", "holiday", "half-day", "full-day"]);
  const isAdminManagedSlug = (slug: string) =>
    isPontoonSlug(slug) || slug === "watersports" || slug === "sunset" || slug === "holiday";
  useEffect(() => {
    bookingCache
      .fetchExperiences()
      .then((data) => {
        setApiError(false);
        const list = Array.isArray(data?.experiences) ? data.experiences : [];
        const next: ExperienceListingPayload[] = [];
        list.forEach((item: {
          slug?: string;
          title?: string;
          subtitle?: string;
          heroMedia?: { type?: "image" | "video"; url?: string };
          gallery?: string[];
          fromPriceCents?: number | null;
          pricingType?: "charter" | "ticketed";
          listingCardImagePosition?: string;
        }) => {
          if (!item.slug) return;
          const hm = item.heroMedia;
          next.push({
            slug: item.slug,
            title: item.title,
            subtitle: item.subtitle,
            heroMedia:
              hm?.url != null ? { type: hm.type ?? "image", url: hm.url } : hm,
            gallery: Array.isArray(item.gallery) ? item.gallery : [],
            fromPriceCents: item.fromPriceCents,
            pricingType: item.pricingType,
            ...(typeof item.listingCardImagePosition === "string" && item.listingCardImagePosition.trim()
              ? { listingCardImagePosition: item.listingCardImagePosition.trim() }
              : {}),
          });
        });
        setListings(next);
      })
      .catch(() => {
        setApiError(true);
        setListings([]);
      });
  }, []);

  /** All charters are up to 6 anglers. */
  const CAPACITY_ALL = "Up to 6";

  const experienceWithListingData = (listing: {
    slug: string;
    title?: string;
    subtitle?: string;
    heroMedia?: { type?: "image" | "video"; url?: string };
    gallery?: string[];
    fromPriceCents?: number | null;
    pricingType?: "charter" | "ticketed";
    listingCardImagePosition?: string;
  }): Experience & { fromPriceCents?: number | null; pricingType?: "charter" | "ticketed" } => {
    const slugKey = listing.slug.trim().toLowerCase();
    const exp = staticBySlug.get(listing.slug) ?? staticBySlug.get(slugKey);
    const fromListing = experienceCardImageUrl(listing.heroMedia, listing.gallery);
    const mergedGallery =
      listing.gallery && listing.gallery.length > 0 && !listing.gallery.every(isLegacyExperienceImage)
        ? listing.gallery.filter((u) => !isLegacyExperienceImage(u))
        : (exp?.gallery ?? []);
    const listingTitle = listing.title?.trim() || "";
    const listingSubtitle = listing.subtitle?.trim() || "";
    return {
      slug: listing.slug,
      title: (!isLegacyListingCopy(listingTitle) && listingTitle) || exp?.title || "Experience",
      shortDescription: (!isLegacyListingCopy(listingSubtitle) && listingSubtitle) || exp?.shortDescription || "",
      description: exp?.description || "",
      highlights: exp?.highlights || [],
      duration: exp?.duration || "See details",
      durationMinutes: exp?.durationMinutes,
      capacity: CAPACITY_ALL,
      heroImage: resolveCardHeroImage(fromListing, exp?.heroImage),
      gallery: mergedGallery.length > 0 ? mergedGallery : (exp?.gallery ?? []),
      pricingNote: exp?.pricingNote || "",
      fromPriceCents: listing.fromPriceCents !== undefined ? listing.fromPriceCents : exp?.fromPriceCents,
      ...(listing.pricingType && { pricingType: listing.pricingType }),
      ...(listing.listingCardImagePosition?.trim() && { listingCardImagePosition: listing.listingCardImagePosition.trim() }),
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
    .filter((item) => !isAdminManagedSlug(item.slug) || activeManagedSlugs.has(item.slug))
    .map(experienceWithListingData);

  type Card = (typeof cards)[number];

  const normSlug = (s: string) => s.trim().toLowerCase();

  /** Homepage: Half Day + Full Day side-by-side on desktop; specialty cards below if active. */
  const pontoonData = cards.find((e) => isPontoonSlug(e.slug)) ?? null;
  const sunsetCard = cards.find((e) => normSlug(e.slug) === "sunset") ?? null;
  const holidayCard = cards.find((e) => normSlug(e.slug) === "holiday") ?? null;
  const watersportsFeatured = cards.find((e) => normSlug(e.slug) === "watersports") ?? null;
  const primaryCards = [pontoonData, watersportsFeatured].filter((e): e is Card => e != null);
  const midRowCards = [sunsetCard, holidayCard].filter((e): e is Card => e != null);

  /** Primary + specialty used; wake aliases never repeat in the grid below. */
  const usedSlugs = new Set<string>();
  for (const e of primaryCards) usedSlugs.add(e.slug);
  if (sunsetCard) usedSlugs.add(sunsetCard.slug);
  if (holidayCard) usedSlugs.add(holidayCard.slug);
  for (const e of cards) {
    if (normSlug(e.slug) === "watersports") continue;
    if (isWatersportsSlug(e.slug) || isWakeSurfClubSlug(e.slug)) usedSlugs.add(e.slug);
  }
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

        {primaryCards.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 lg:gap-6 mb-6 sm:mb-8">
            {primaryCards.map((data, i) => {
              const isFullDay = normSlug(data.slug) === "watersports";
              return (
                <motion.div
                  key={data.slug}
                  className="min-w-0 relative h-full"
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.45, delay: 0.1 + i * 0.06 }}
                >
                  <Link
                    href={getCanonicalExperiencePath(data.slug)}
                    className="group block relative h-full rounded-2xl bg-brand-dark ring-4 ring-brand-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 transition-all duration-300 hover:shadow-2xl hover:shadow-brand-primary/25 hover:-translate-y-1 hover:ring-brand-primary/90"
                    aria-label={`${data.title} — view details`}
                  >
                    {isFullDay && (
                      <div
                        className="absolute top-0 right-0 z-20 w-40 h-40 sm:w-52 sm:h-52 lg:w-64 lg:h-64 pointer-events-none translate-x-[28%] -translate-y-1/2 rotate-[16deg] transition-transform duration-500 ease-out group-hover:scale-105 group-hover:rotate-[20deg]"
                        aria-hidden
                      >
                        <Image
                          src="/photos/most-popular.png"
                          alt=""
                          fill
                          className="object-contain drop-shadow-xl transition-[filter] duration-500 group-hover:drop-shadow-2xl"
                          sizes="(max-width: 640px) 160px, (max-width: 1024px) 208px, 256px"
                        />
                      </div>
                    )}
                    <div className="relative overflow-hidden rounded-2xl aspect-[4/3] min-h-[240px] sm:min-h-[280px] lg:min-h-[320px] h-full">
                      <Image
                        src={getDisplayImageUrl(data.heroImage)}
                        alt=""
                        fill
                        className={cn(
                          "object-cover transition-transform duration-500 group-hover:scale-[1.03]",
                          isFullDay
                            ? "object-[center_22%] sm:object-[center_18%]"
                            : !data.listingCardImagePosition?.trim() && "object-center"
                        )}
                        style={
                          !isFullDay && data.listingCardImagePosition?.trim()
                            ? { objectPosition: data.listingCardImagePosition.trim() }
                            : undefined
                        }
                        sizes="(max-width: 768px) 100vw, 50vw"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 from-18% via-black/40 to-transparent sm:from-black/88 sm:from-22%" />
                      <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-6 lg:p-8">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs sm:text-sm text-white mb-1.5">
                          <span className="inline-flex items-center gap-1.5 sm:gap-2">
                            <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" aria-hidden />
                            {data.duration}
                          </span>
                          <span className="inline-flex items-center gap-1.5 sm:gap-2">
                            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" aria-hidden />
                            {data.capacity}
                          </span>
                        </div>
                        <h3 className="font-display text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-tight leading-snug">
                          {data.title}
                        </h3>
                        <p className="mt-2 sm:mt-3 text-white/90 text-sm sm:text-base max-w-lg line-clamp-3 leading-relaxed">
                          {data.shortDescription}
                        </p>
                        <div className="mt-4 sm:mt-5 flex flex-wrap items-center gap-2 sm:gap-4">
                          <span className="text-base sm:text-xl font-bold text-brand-primary">
                            {formatExperiencePriceLabel(
                              data.slug,
                              data.fromPriceCents ?? null,
                              (data as { pricingType?: "charter" | "ticketed" }).pricingType
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
              );
            })}
          </div>
        )}

        {midRowCards.length > 0 && (
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
                href={getCanonicalExperiencePath(data.slug)}
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
        )}

        {rest.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-5">
          {rest.map((data, i) => {
            return (
              <motion.div
                key={data.slug}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-30px" }}
                transition={{ duration: 0.4, delay: 0.15 + i * 0.06 }}
              >
                <Link
                  href={getCanonicalExperiencePath(data.slug)}
                  className="group block relative rounded-2xl bg-brand-dark ring-4 ring-brand-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 transition-all duration-300 hover:shadow-2xl hover:shadow-brand-primary/25 hover:-translate-y-1 hover:ring-brand-primary/90"
                  aria-label={`${data.title} — view details`}
                >
                <div className="relative overflow-hidden rounded-2xl aspect-[4/3] min-h-[200px] sm:min-h-[220px]">
                  <Image
                    src={getDisplayImageUrl(data.heroImage)}
                    alt=""
                    fill
                    className={cn(
                      "object-cover transition-transform duration-500 group-hover:scale-[1.03]",
                      !data.listingCardImagePosition?.trim() && "object-center"
                    )}
                    style={
                      data.listingCardImagePosition?.trim()
                        ? { objectPosition: data.listingCardImagePosition.trim() }
                        : undefined
                    }
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
