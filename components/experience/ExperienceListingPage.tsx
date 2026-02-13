"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, MapPin } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { useBookingModal } from "@/components/site/BookingModalContext";
import { getDisplayImageUrl } from "@/lib/utils";
import { ExperienceCalendarSection } from "./ExperienceCalendarSection";
import type { ExperienceWithDetails } from "@/lib/booking/get-experience-by-slug";

interface ExperienceListingPageProps {
  data: ExperienceWithDetails;
}

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
};

const stagger = (i: number) => ({ delay: i * 0.08 });

export function ExperienceListingPage({ data }: ExperienceListingPageProps) {
  const reduceMotion = useReducedMotion();
  const { openWithSelection } = useBookingModal();
  const { id, experience, rates, addons } = data;
  const fromPrice = rates.length > 0 ? Math.min(...rates.map((r) => r.priceCents)) : null;
  const ctaText = experience.ctaButtonText?.trim() || "Book now";
  const bookHref = `/experiences/${experience.slug}/book`;
  const heroOverlay = experience.heroOverlayText?.trim() || (fromPrice != null ? `From $${(fromPrice / 100).toFixed(0)}` : null);
  const cancellationSummary = experience.cancellationSummary?.trim();
  const testimonials = experience.testimonials?.filter((t) => t.name || t.quote) ?? [];
  const gallery = experience.gallery ?? [];

  const motionProps = reduceMotion
    ? { initial: false, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
    : fadeUp;

  return (
    <div className="pb-32 lg:pb-24">
      {/* Hero – full bleed, animated */}
      <section className="relative w-full min-h-[55vh] sm:min-h-[60vh] lg:min-h-[70vh] overflow-hidden bg-brand-dark">
        {experience.heroMedia?.url ? (
          <Image
            src={getDisplayImageUrl(experience.heroMedia.url)}
            alt=""
            fill
            className={
              (experience.slug === "pontoon" || experience.slug === "sunset")
                ? "object-cover object-[center_65%] scale-105"
                : "object-cover object-center scale-105"
            }
            priority
            sizes="100vw"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-brand-muted/30 to-brand-dark" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-brand-dark from-30% via-brand-dark/60 via-55% to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_40%_at_50%_120%,rgba(80,189,186,0.2),transparent_50%)]" />

        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-14 sm:pb-20 lg:pb-24">
            <motion.div
              className="flex flex-wrap items-center gap-4 mb-4"
              initial={motionProps.initial ?? { opacity: 0, y: 20 }}
              animate={motionProps.animate}
              transition={{ ...motionProps.transition, delay: reduceMotion ? 0 : 0.1 }}
            >
              <Link
                href="/experiences"
                className="inline-flex items-center gap-2 text-white/80 text-sm font-medium hover:text-brand-primary transition-colors"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                All trips
              </Link>
              {heroOverlay && (
                <span className="text-brand-primary text-xs font-semibold uppercase tracking-[0.2em]">
                  {heroOverlay}
                </span>
              )}
            </motion.div>
            <motion.h1
              className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl 2xl:text-8xl font-bold tracking-tight text-white [text-shadow:0_2px_40px_rgba(0,0,0,0.4)]"
              initial={motionProps.initial ?? { opacity: 0, y: 24 }}
              animate={motionProps.animate}
              transition={{ ...motionProps.transition, delay: reduceMotion ? 0 : 0.15 }}
            >
              {experience.title}
            </motion.h1>
            <motion.p
              className="mt-4 text-lg sm:text-xl lg:text-2xl text-white/90 max-w-2xl leading-relaxed"
              initial={motionProps.initial ?? { opacity: 0, y: 24 }}
              animate={motionProps.animate}
              transition={{ ...motionProps.transition, delay: reduceMotion ? 0 : 0.22 }}
            >
              {experience.subtitle}
            </motion.p>
            <motion.p
              className="mt-5 text-sm text-white/75 flex flex-wrap gap-x-4 gap-y-1"
              initial={motionProps.initial ?? { opacity: 0, y: 20 }}
              animate={motionProps.animate}
              transition={{ ...motionProps.transition, delay: reduceMotion ? 0 : 0.28 }}
            >
              <span>{experience.maxGuests} guests</span>
              {cancellationSummary ? <span>{cancellationSummary}</span> : <span>Free cancellation</span>}
              {experience.included?.length ? <span>We bring the gear</span> : null}
            </motion.p>
          </div>
        </div>
      </section>

      {/* Mobile sticky bar */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-between gap-4 border-t border-brand-dark/10 bg-white/95 backdrop-blur-xl px-4 py-3 lg:hidden shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.08)]"
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30, delay: 0.4 }}
      >
        <span className="font-bold text-brand-dark">
          {fromPrice != null ? `From $${(fromPrice / 100).toFixed(0)}` : "See dates"}
        </span>
        <Button asChild size="lg" className="rounded-xl shrink-0">
          <Link href={bookHref}>{ctaText}</Link>
        </Button>
      </motion.div>

      {/* What it's like – full width, teal tint */}
      <motion.section
        className="w-full bg-brand-bg py-16 sm:py-20 lg:py-24"
        initial={reduceMotion ? false : { opacity: 0, y: 32 }}
        whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-16 items-start">
            <div className="lg:col-span-5">
              <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-brand-primary">
                What it&apos;s like
              </span>
              <h2 className="mt-3 text-2xl sm:text-3xl font-bold text-brand-dark tracking-tight">
                The vibe
              </h2>
            </div>
            <div className="lg:col-span-7 prose prose-lg max-w-none text-brand-dark leading-relaxed whitespace-pre-line text-[1.05rem] sm:text-[1.1rem]">
              {experience.descriptionLong}
            </div>
          </div>
        </div>
      </motion.section>

      {/* Gallery – full width bento */}
      {gallery.length > 0 && (
        <motion.section
          className="w-full bg-white py-16 sm:py-20 lg:py-24"
          initial={reduceMotion ? false : { opacity: 0, y: 32 }}
          whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-brand-secondary">
              On the water
            </span>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-brand-dark tracking-tight">
              Gallery
            </h2>
            <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {gallery.length === 1 ? (
                <motion.div
                  className="relative col-span-2 aspect-[16/10] rounded-2xl overflow-hidden bg-brand-dark/10"
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
                  whileInView={reduceMotion ? {} : { opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  <Image
                    src={getDisplayImageUrl(gallery[0])}
                    alt={experience.galleryAltTexts?.[0]?.trim() || "Gallery"}
                    fill
                    className={(experience.slug === "pontoon" || experience.slug === "sunset") ? "object-cover object-[center_65%]" : "object-cover"}
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                </motion.div>
              ) : (
                <>
                  {/* First image: large, spans 2 cols */}
                  <motion.div
                    className="relative col-span-2 row-span-2 min-h-[200px] rounded-2xl overflow-hidden bg-brand-dark/10"
                    initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                    whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.45, delay: 0 }}
                    whileHover={reduceMotion ? {} : { scale: 1.02 }}
                  >
                    <Image
                      src={getDisplayImageUrl(gallery[0])}
                      alt={experience.galleryAltTexts?.[0]?.trim() || "Gallery 1"}
                      fill
                      className={(experience.slug === "pontoon" || experience.slug === "sunset") ? "object-cover object-[center_65%]" : "object-cover"}
                      sizes="(max-width: 1024px) 100vw, 50vw"
                    />
                  </motion.div>
                  {/* Next 4 in 2x2 */}
                  {gallery.slice(1, 5).map((src, i) => (
                    <motion.div
                      key={src + i}
                      className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-brand-dark/10"
                      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                      whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.45, delay: stagger(i + 1).delay }}
                      whileHover={reduceMotion ? {} : { scale: 1.02 }}
                    >
                      <Image
                        src={getDisplayImageUrl(src)}
                        alt={experience.galleryAltTexts?.[i + 1]?.trim() || `Gallery ${i + 2}`}
                        fill
                        className={(experience.slug === "pontoon" || experience.slug === "sunset") ? "object-cover object-[center_65%]" : "object-cover"}
                        sizes="(max-width: 640px) 50vw, 25vw"
                      />
                    </motion.div>
                  ))}
                  {/* Next 2 fill the row */}
                  {gallery.slice(5, 7).map((src, i) => (
                    <motion.div
                      key={src + i}
                      className="relative col-span-2 lg:col-span-1 aspect-[4/3] rounded-2xl overflow-hidden bg-brand-dark/10"
                      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                      whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.45, delay: stagger(i + 5).delay }}
                      whileHover={reduceMotion ? {} : { scale: 1.02 }}
                    >
                      <Image
                        src={getDisplayImageUrl(src)}
                        alt={experience.galleryAltTexts?.[i + 5]?.trim() || `Gallery ${i + 6}`}
                        fill
                        className="object-cover"
                        sizes="(max-width: 1024px) 50vw, 25vw"
                      />
                    </motion.div>
                  ))}
                </>
              )}
            </div>
            {gallery.length > 7 && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {gallery.slice(7).map((src, i) => (
                  <motion.div
                    key={src + i}
                    className="relative aspect-[4/3] rounded-xl overflow-hidden bg-brand-dark/10"
                    initial={reduceMotion ? false : { opacity: 0 }}
                    whileInView={reduceMotion ? {} : { opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35, delay: (i % 4) * 0.05 }}
                  >
                    <Image
                      src={getDisplayImageUrl(src)}
                      alt={experience.galleryAltTexts?.[i + 7]?.trim() || `Gallery ${i + 8}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, 25vw"
                    />
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.section>
      )}

      {/* We've got you – gradient strip */}
      {experience.included?.length > 0 && (
        <motion.section
          className="w-full py-16 sm:py-20 lg:py-24 bg-gradient-to-br from-brand-primary/15 via-brand-bg to-brand-secondary/10"
          initial={reduceMotion ? false : { opacity: 0, y: 32 }}
          whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-brand-muted">
              We&apos;ve got you
            </span>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-brand-dark tracking-tight">
              What we bring
            </h2>
            <p className="mt-2 text-brand-muted max-w-xl">
              So you can just show up.
            </p>
            <ul className="mt-8 flex flex-wrap gap-3 list-none p-0 m-0">
              {experience.included.map((item, i) => (
                <li key={item}>
                  <motion.span
                    className="inline-flex items-center gap-2 rounded-full bg-white/90 px-5 py-2.5 text-sm font-medium text-brand-dark shadow-soft border border-brand-primary/20"
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.95 }}
                    whileInView={reduceMotion ? {} : { opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: stagger(i).delay }}
                    whileHover={reduceMotion ? {} : { y: -2, boxShadow: "0 8px 24px -4px rgb(0 0 0 / 0.12)" }}
                  >
                    <span className="h-2 w-2 rounded-full bg-brand-primary shrink-0" aria-hidden />
                    {item}
                  </motion.span>
                </li>
              ))}
            </ul>
          </div>
        </motion.section>
      )}

      {/* Location + Cancellation – two columns on large */}
      <motion.section
        className="w-full bg-white py-16 sm:py-20 lg:py-24"
        initial={reduceMotion ? false : { opacity: 0, y: 32 }}
        whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 gap-10 lg:gap-16">
            {experience.location && (
              <div className="flex gap-4 p-6 rounded-2xl bg-brand-bg/60 border border-brand-primary/10">
                <MapPin className="h-7 w-7 text-brand-primary shrink-0 mt-0.5" aria-hidden />
                <div>
                  <p className="font-bold text-brand-dark text-lg">{experience.location.title}</p>
                  <p className="text-brand-muted text-base mt-1">{experience.location.addressText}</p>
                  {experience.location.notes && (
                    <p className="mt-2 text-sm text-brand-muted">{experience.location.notes}</p>
                  )}
                </div>
              </div>
            )}
            {(cancellationSummary || experience.cancellationPolicy?.fullText) && (
              <div className="p-6 rounded-2xl border-l-4 border-brand-secondary/40 bg-brand-bg/40">
                <p className="font-bold text-brand-dark">Cancellation</p>
                {cancellationSummary && <p className="mt-1 text-brand-dark font-medium">{cancellationSummary}</p>}
                {experience.cancellationPolicy?.fullText && (
                  <p className="mt-2 text-sm text-brand-muted leading-relaxed">{experience.cancellationPolicy.fullText}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.section>

      {/* Testimonials – full width, colored accents */}
      {testimonials.length > 0 && (
        <motion.section
          className="w-full bg-brand-bg py-16 sm:py-20 lg:py-24"
          initial={reduceMotion ? false : { opacity: 0, y: 32 }}
          whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-brand-secondary">
              What people say
            </span>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-brand-dark tracking-tight">
              Real stories
            </h2>
            <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-10">
              {testimonials.map((t, i) => (
                <motion.blockquote
                  key={i}
                  className="pl-6 border-l-4 border-brand-primary bg-white/70 rounded-r-2xl py-6 pr-6 shadow-soft"
                  initial={reduceMotion ? false : { opacity: 0, x: -16 }}
                  whileInView={reduceMotion ? {} : { opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: stagger(i).delay }}
                >
                  <p className="text-lg sm:text-xl text-brand-dark leading-relaxed font-medium">&ldquo;{t.quote}&rdquo;</p>
                  <footer className="mt-4 text-sm font-medium text-brand-muted">
                    — {t.name}
                    {t.date && <span className="font-normal ml-1">({t.date})</span>}
                  </footer>
                </motion.blockquote>
              ))}
            </div>
          </div>
        </motion.section>
      )}

      {/* FAQ – full width */}
      {experience.faqs?.length > 0 && (
        <motion.section
          className="w-full bg-white py-16 sm:py-20 lg:py-24"
          initial={reduceMotion ? false : { opacity: 0, y: 32 }}
          whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-brand-primary">
              Common questions
            </span>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-brand-dark tracking-tight">
              FAQ
            </h2>
            <div className="mt-8 rounded-2xl border border-brand-dark/10 overflow-hidden bg-brand-bg/30">
              <Accordion type="single" collapsible className="w-full">
                {experience.faqs.map((item, i) => (
                  <AccordionItem key={i} value={`faq-${i}`} className="border-brand-dark/8 border-b last:border-b-0">
                    <AccordionTrigger className="text-left font-semibold text-brand-dark py-5 px-6 hover:no-underline hover:bg-brand-primary/5 data-[state=open]:bg-brand-primary/5">
                      {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-brand-muted text-base leading-relaxed px-6 pb-5">
                      {item.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </motion.section>
      )}

      {/* Calendar – full width */}
      <motion.section
        className="w-full bg-brand-bg py-16 sm:py-20 lg:py-24"
        initial={reduceMotion ? false : { opacity: 0, y: 32 }}
        whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ExperienceCalendarSection
            experienceId={id}
            experienceSlug={experience.slug}
            bookHref={bookHref}
            onOpenInModal={(selection) => openWithSelection({ ...selection, experienceId: id, experienceSlug: experience.slug })}
          />
        </div>
      </motion.section>

      {/* Final CTA – navy + gradient accent */}
      <motion.section
        className="w-full bg-brand-dark py-20 sm:py-24 lg:py-28 relative overflow-hidden"
        initial={reduceMotion ? false : { opacity: 0, y: 32 }}
        whileInView={reduceMotion ? {} : { opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/20 via-transparent to-brand-secondary/15" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-primary/50 to-transparent" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white tracking-tight">
            Ready when you are.
          </h2>
          <p className="mt-4 text-lg text-white/80 max-w-xl mx-auto">
            Pick your day — we&apos;ll hold your slot while you pay. See you on the water.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <motion.div
              whileHover={reduceMotion ? {} : { scale: 1.03 }}
              whileTap={reduceMotion ? {} : { scale: 0.98 }}
            >
              <Button asChild size="lg" className="rounded-xl h-14 px-10 text-lg font-bold bg-brand-primary text-brand-dark hover:bg-brand-primary/90 shadow-premium">
                <Link href={bookHref}>{ctaText}</Link>
              </Button>
            </motion.div>
            <Link
              href="/experiences"
              className="text-brand-primary font-semibold hover:text-white/90 transition-colors"
            >
              See all trips
            </Link>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
