"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, MapPin, Users } from "lucide-react";
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

export function ExperienceListingPage({ data }: ExperienceListingPageProps) {
  const { openWithSelection } = useBookingModal();
  const { id, experience, rates, addons } = data;
  const fromPrice = rates.length > 0 ? Math.min(...rates.map((r) => r.priceCents)) : null;
  const ctaText = experience.ctaButtonText?.trim() || "Book now";
  const bookHref = `/experiences/${experience.slug}/book`;
  const heroOverlay = experience.heroOverlayText?.trim() || (fromPrice != null ? `From $${(fromPrice / 100).toFixed(0)}` : null);
  const cancellationSummary = experience.cancellationSummary?.trim();
  const testimonials = experience.testimonials?.filter((t) => t.name || t.quote) ?? [];

  return (
    <div className="bg-brand-bg/50 pb-36 lg:pb-0">
      {/* Hero – full-bleed, tall, dramatic overlay */}
      <section className="relative w-full min-h-[320px] sm:min-h-[380px] lg:min-h-[440px] max-h-[70vh] overflow-hidden bg-brand-dark">
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
          <div className="absolute inset-0 bg-brand-muted/30" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-brand-dark via-brand-dark/70 via-40% to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(80,189,186,0.15),transparent)]" />
        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-10 sm:pb-14 lg:pb-20 pt-32">
            {heroOverlay && (
              <p className="text-xs sm:text-sm font-bold text-brand-primary uppercase tracking-[0.2em] mb-3">
                {heroOverlay}
              </p>
            )}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight text-white drop-shadow-2xl [text-shadow:0_2px_20px_rgba(0,0,0,0.4)]">
              {experience.title}
            </h1>
            <p className="mt-4 text-lg sm:text-xl lg:text-2xl text-white/90 max-w-2xl leading-relaxed">
              {experience.subtitle}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              {fromPrice != null && (
                <span className="inline-flex items-center rounded-full bg-white/15 backdrop-blur-sm border border-white/20 px-4 py-2 text-sm font-bold text-white">
                  From ${(fromPrice / 100).toFixed(0)}
                </span>
              )}
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 px-4 py-2 text-sm text-white/95">
                <Users className="h-4 w-4 shrink-0 text-brand-primary" aria-hidden />
                {experience.maxGuests} guests
              </span>
              {experience.included?.length > 0 && (
                <span className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 px-4 py-2 text-sm text-white/95">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-primary" aria-hidden />
                  {experience.included[0]}
                </span>
              )}
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 px-4 py-2 text-sm text-white/95">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-primary" aria-hidden />
                {cancellationSummary || "Free cancellation"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile: sticky bottom bar – human, not appy */}
      <div className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-between gap-4 border-t border-brand-dark/10 bg-white/95 backdrop-blur-lg px-4 py-3 shadow-premium lg:hidden">
        <div>
          {fromPrice != null && (
            <span className="font-bold text-brand-dark">From ${(fromPrice / 100).toFixed(0)}</span>
          )}
          <span className="ml-2 text-sm text-brand-muted">· reserve your day</span>
        </div>
        <Button asChild size="lg" className="rounded-xl shrink-0">
          <Link href={bookHref}>{ctaText}</Link>
        </Button>
      </div>

      {/* Main content – editorial flow, less card-heavy */}
      <section className="section-padding pt-12 sm:pt-16 lg:pt-24">
        <div className="container-narrow mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href="/experiences"
            className="inline-flex items-center gap-2 text-brand-primary font-semibold text-sm sm:text-base mb-8 sm:mb-10 hover:text-brand-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary rounded-lg transition-colors"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            See all trips
          </Link>
          <div className="space-y-14 lg:space-y-20">
            {/* Overview – editorial, human tone */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-brand-dark mb-4 tracking-tight">The vibe</h2>
              <div className="prose prose-lg max-w-none text-brand-dark leading-relaxed whitespace-pre-line">
                {experience.descriptionLong}
              </div>
            </div>

            {/* Gallery – on the water */}
            {experience.gallery?.length > 0 && (
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-brand-primary mb-4">On the water</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5">
                  {experience.gallery.map((src, i) => (
                    <div key={src + i} className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-brand-dark/5 ring-1 ring-brand-dark/5 transition-transform duration-300 hover:scale-[1.02]">
                      <Image
                        src={getDisplayImageUrl(src)}
                        alt={experience.galleryAltTexts?.[i]?.trim() || `Gallery image ${i + 1}`}
                        fill
                        className={(experience.slug === "pontoon" || experience.slug === "sunset") ? "object-cover object-[center_65%]" : "object-cover"}
                        sizes="(max-width: 640px) 50vw, 33vw"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* We've got you – what we bring */}
            {experience.included?.length > 0 && (
              <div className="py-6 border-t border-brand-dark/10">
                <p className="text-lg font-bold text-brand-dark mb-4">We&apos;ve got you.</p>
                <p className="text-brand-muted text-base mb-4">What we bring so you can just show up:</p>
                <ul className="flex flex-wrap gap-2 sm:gap-3">
                  {experience.included.map((item) => (
                    <li key={item} className="inline-flex items-center gap-2 rounded-full bg-brand-bg/80 px-4 py-2 text-sm font-medium text-brand-dark border border-brand-dark/5">
                      <span className="h-2 w-2 rounded-full bg-brand-primary shrink-0" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Where we meet */}
            {experience.location && (
              <div className="flex flex-col sm:flex-row sm:items-start gap-3 py-4">
                <MapPin className="h-6 w-6 text-brand-primary shrink-0 mt-0.5" aria-hidden />
                <div>
                  <p className="font-bold text-brand-dark">{experience.location.title}</p>
                  <p className="text-brand-muted text-sm sm:text-base">{experience.location.addressText}</p>
                  {experience.location.notes && (
                    <p className="mt-1 text-sm text-brand-muted">{experience.location.notes}</p>
                  )}
                </div>
              </div>
            )}

            {/* Cancellation – human note */}
            {(cancellationSummary || experience.cancellationPolicy?.fullText) && (
              <div className="text-sm text-brand-muted border-l-2 border-brand-primary/30 pl-4 py-2">
                <p className="font-medium text-brand-dark">Life happens. Here&apos;s our cancellation policy:</p>
                {cancellationSummary && <p className="mt-1 font-medium text-brand-dark">{cancellationSummary}</p>}
                {experience.cancellationPolicy?.fullText && (
                  <p className="mt-1 leading-relaxed">{experience.cancellationPolicy.fullText}</p>
                )}
              </div>
            )}

            {/* Real people, real days */}
            {testimonials.length > 0 && (
              <div className="space-y-8">
                <p className="text-lg font-bold text-brand-dark">Real people, real days.</p>
                <div className="space-y-8">
                  {testimonials.map((t, i) => (
                    <blockquote key={i} className="pl-0 sm:pl-6 border-l-0 sm:border-l-4 border-brand-primary/40">
                      <p className="text-xl sm:text-2xl text-brand-dark leading-relaxed font-medium">&ldquo;{t.quote}&rdquo;</p>
                      <footer className="mt-3 text-sm font-medium text-brand-muted">
                        — {t.name}
                        {t.date && <span className="ml-1 font-normal">({t.date})</span>}
                      </footer>
                    </blockquote>
                  ))}
                </div>
              </div>
            )}

            {/* Quick answers */}
            {experience.faqs?.length > 0 && (
              <div>
                <h2 id="faq-heading" className="text-lg font-bold text-brand-dark mb-4">
                  Questions? We&apos;ve got answers.
                </h2>
                <Accordion type="single" collapsible className="w-full rounded-xl border border-brand-dark/10 overflow-hidden bg-white/30">
                  {experience.faqs.map((item, i) => (
                    <AccordionItem key={i} value={`faq-${i}`} className="border-brand-dark/10">
                      <AccordionTrigger className="text-left font-semibold text-base py-5 px-5 hover:no-underline hover:bg-brand-bg/50">
                        {item.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-base text-brand-muted leading-relaxed px-5 pb-5">
                        {item.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}

            <ExperienceCalendarSection
              experienceId={id}
              experienceSlug={experience.slug}
              bookHref={bookHref}
              onOpenInModal={(selection) => openWithSelection({ ...selection, experienceId: id, experienceSlug: experience.slug })}
            />

            {/* Final CTA – badass, human */}
            <div className="rounded-2xl bg-brand-dark p-8 sm:p-12 text-center text-white">
              <p className="text-xl sm:text-2xl font-semibold text-white mb-2">
                Ready? Pick your day.
              </p>
              <p className="text-base text-white/80 mb-8 max-w-lg mx-auto">
                We&apos;ll hold your slot while you pay. See you on the water.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Button asChild size="lg" className="rounded-xl h-14 px-12 text-base font-bold bg-brand-primary text-brand-dark hover:bg-brand-primary/90">
                  <Link href={bookHref}>{ctaText}</Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="rounded-xl h-14 px-12 border-2 border-white/50 text-white hover:bg-white/15 font-medium">
                  <Link href="/experiences">See all trips</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
